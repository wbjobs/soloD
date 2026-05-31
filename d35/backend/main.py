from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from jose import JWTError, jwt
from datetime import datetime, timedelta
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session, relationship
import os
import uuid
import shutil
import signal
import sys
from dotenv import load_dotenv
from celery import Celery
import subprocess

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./audio_app.db")
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-this-in-production")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 30))
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "../uploads")
PROCESSED_DIR = os.getenv("PROCESSED_DIR", "../processed")
FFMPEG_PATH = os.getenv("FFMPEG_PATH", "ffmpeg")

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(PROCESSED_DIR, exist_ok=True)

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

celery = Celery(
    "audio_tasks",
    broker=REDIS_URL,
    backend=REDIS_URL
)

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    tasks = relationship("Task", back_populates="owner")

class Task(Base):
    __tablename__ = "tasks"
    id = Column(String, primary_key=True, index=True)
    filename = Column(String)
    status = Column(String, default="pending")
    task_type = Column(String, default="denoise")
    config = Column(String, default="{}")
    created_at = Column(DateTime, default=datetime.utcnow)
    owner_id = Column(Integer, ForeignKey("users.id"))
    owner = relationship("User", back_populates="tasks")

Base.metadata.create_all(bind=engine)

try:
    with engine.connect() as conn:
        conn.execute("ALTER TABLE tasks ADD COLUMN task_type VARCHAR DEFAULT 'denoise'")
        conn.execute("ALTER TABLE tasks ADD COLUMN config VARCHAR DEFAULT '{}'")
except:
    pass

class UserCreate(BaseModel):
    username: str
    email: str
    password: str

class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    class Config:
        orm_mode = True

class Token(BaseModel):
    access_token: str
    token_type: str

class TaskResponse(BaseModel):
    id: str
    filename: str
    status: str
    task_type: str
    created_at: datetime
    class Config:
        orm_mode = True

class MixTrackConfig(BaseModel):
    track_index: int
    volume: float = 1.0
    pan: float = 0.0
    delay_ms: int = 0

class MixConfig(BaseModel):
    output_format: str = "wav"
    sample_rate: int = 44100
    normalization: bool = True
    tracks: list[MixTrackConfig] = []

app = FastAPI(title="音频处理API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def get_user(db: Session, username: str):
    return db.query(User).filter(User.username == username).first()

def authenticate_user(db: Session, username: str, password: str):
    user = get_user(db, username)
    if not user:
        return False
    if not verify_password(password, user.hashed_password):
        return False
    return user

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="无法验证凭据",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = get_user(db, username=username)
    if user is None:
        raise credentials_exception
    return user

def run_ffmpeg_safe(cmd, timeout=300):
    process = None
    try:
        kwargs = {
            'stdout': subprocess.PIPE,
            'stderr': subprocess.PIPE,
            'text': True
        }
        
        if sys.platform != 'win32':
            kwargs['preexec_fn'] = os.setsid
            kwargs['start_new_session'] = True
        else:
            kwargs['creationflags'] = subprocess.CREATE_NO_WINDOW
        
        process = subprocess.Popen(cmd, **kwargs)
        
        stdout, stderr = process.communicate(timeout=timeout)
        
        return process.returncode, stdout, stderr
        
    except subprocess.TimeoutExpired:
        if process:
            try:
                if sys.platform != 'win32':
                    os.killpg(os.getpgid(process.pid), signal.SIGTERM)
                else:
                    process.terminate()
                process.wait(timeout=5)
            except:
                if process and process.poll() is None:
                    try:
                        if sys.platform != 'win32':
                            os.killpg(os.getpgid(process.pid), signal.SIGKILL)
                        else:
                            process.kill()
                    except:
                        pass
        raise
    finally:
        if process:
            try:
                if process.stdout:
                    process.stdout.close()
                if process.stderr:
                    process.stderr.close()
            except:
                pass

@celery.task(bind=True, time_limit=360, soft_time_limit=300)
def process_audio_task(self, task_id: str, input_path: str, output_path: str):
    db = None
    try:
        db = SessionLocal()
        task = db.query(Task).filter(Task.id == task_id).first()
        if task:
            task.status = "processing"
            db.commit()

        cmd = [
            FFMPEG_PATH,
            "-i", input_path,
            "-af", "afftdn=nf=-20",
            "-n",
            "-hide_banner",
            "-loglevel", "error",
            output_path
        ]
        
        returncode, stdout, stderr = run_ffmpeg_safe(cmd, timeout=240)
        
        if returncode == 0:
            if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
                task.status = "completed"
            else:
                task.status = "failed"
                print(f"FFmpeg produced empty file: {output_path}")
        else:
            task.status = "failed"
            print(f"FFmpeg error (code {returncode}): {stderr}")
        
        db.commit()
        return {"status": task.status, "task_id": task_id}
        
    except subprocess.TimeoutExpired:
        if task:
            task.status = "failed"
            db.commit()
        print(f"FFmpeg timeout for task: {task_id}")
        return {"status": "failed", "task_id": task_id, "error": "Processing timeout"}
    except Exception as e:
        if task:
            task.status = "failed"
            db.commit()
        print(f"Error processing task {task_id}: {e}")
        return {"status": "failed", "task_id": task_id, "error": str(e)}
    finally:
        if db:
            db.close()

import json

def get_audio_duration(file_path: str) -> float:
    cmd = [
        FFMPEG_PATH,
        "-i", file_path,
        "-show_entries", "format=duration",
        "-v", "quiet",
        "-of", "csv=p=0"
    ]
    try:
        returncode, stdout, stderr = run_ffmpeg_safe(cmd, timeout=30)
        if returncode == 0 and stdout.strip():
            return float(stdout.strip())
    except:
        pass
    return 0.0

@celery.task(bind=True, time_limit=600, soft_time_limit=480)
def process_mix_task(self, task_id: str, input_files: list, output_path: str, config_str: str):
    db = None
    temp_files = []
    try:
        db = SessionLocal()
        task = db.query(Task).filter(Task.id == task_id).first()
        if task:
            task.status = "processing"
            db.commit()
        
        config = json.loads(config_str)
        tracks_config = config.get("tracks", [])
        sample_rate = config.get("sample_rate", 44100)
        normalization = config.get("normalization", True)
        
        if len(input_files) == 0:
            raise ValueError("No input files provided")
        
        max_duration = 0
        durations = []
        for input_path in input_files:
            duration = get_audio_duration(input_path)
            durations.append(duration)
            max_duration = max(max_duration, duration)
        
        cmd = [FFMPEG_PATH, "-y"]
        
        for input_path in input_files:
            cmd.extend(["-i", input_path])
        
        filter_complex = []
        for i, (input_path, track_config) in enumerate(zip(input_files, tracks_config)):
            volume = track_config.get("volume", 1.0)
            delay_ms = track_config.get("delay_ms", 0)
            pan = track_config.get("pan", 0.0)
            
            track_filters = []
            
            if delay_ms > 0:
                track_filters.append(f"adelay={delay_ms}|{delay_ms}")
            
            track_filters.append(f"volume={volume}")
            
            if pan != 0:
                pan_value = 0.5 + pan * 0.5
                track_filters.append(f"pan=stereo|c0={1-pan_value}*c0|c1={pan_value}*c1")
            
            if track_filters:
                filter_str = ",".join(track_filters)
                filter_complex.append(f"[{i}:a]{filter_str}[a{i}]")
            else:
                filter_complex.append(f"[{i}:a]anull[a{i}]")
        
        inputs = "".join([f"[a{i}]" for i in range(len(input_files))])
        
        amix_params = f"amix=inputs={len(input_files)}:duration=longest"
        if normalization:
            filter_complex.append(f"{inputs}{amix_params},loudnorm=I=-16:LRA=11:TP=-1.5[out]")
        else:
            filter_complex.append(f"{inputs}{amix_params}[out]")
        
        cmd.extend([
            "-filter_complex", ";".join(filter_complex),
            "-map", "[out]",
            "-ar", str(sample_rate),
            "-c:a", "pcm_s16le",
            "-hide_banner",
            "-loglevel", "error",
            output_path
        ])
        
        returncode, stdout, stderr = run_ffmpeg_safe(cmd, timeout=480)
        
        if returncode == 0:
            if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
                task.status = "completed"
            else:
                task.status = "failed"
                print(f"FFmpeg produced empty file: {output_path}")
        else:
            task.status = "failed"
            print(f"FFmpeg mix error (code {returncode}): {stderr}")
        
        db.commit()
        return {"status": task.status, "task_id": task_id}
        
    except subprocess.TimeoutExpired:
        if task:
            task.status = "failed"
            db.commit()
        print(f"FFmpeg mix timeout for task: {task_id}")
        return {"status": "failed", "task_id": task_id, "error": "Processing timeout"}
    except Exception as e:
        if task:
            task.status = "failed"
            db.commit()
        print(f"Error processing mix task {task_id}: {e}")
        return {"status": "failed", "task_id": task_id, "error": str(e)}
    finally:
        for temp_file in temp_files:
            try:
                if os.path.exists(temp_file):
                    os.remove(temp_file)
            except:
                pass
        if db:
            db.close()

@app.post("/api/auth/register", response_model=UserResponse)
def register(user: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="用户名已存在")
    db_email = db.query(User).filter(User.email == user.email).first()
    if db_email:
        raise HTTPException(status_code=400, detail="邮箱已存在")
    
    hashed_password = get_password_hash(user.password)
    db_user = User(username=user.username, email=user.email, hashed_password=hashed_password)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

@app.post("/api/auth/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/api/auth/me", response_model=UserResponse)
def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user

@app.post("/api/upload")
async def upload_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not file.filename.lower().endswith(('.wav', '.mp3', '.flac', '.ogg', '.m4a')):
        raise HTTPException(status_code=400, detail="不支持的文件格式")
    
    task_id = str(uuid.uuid4())
    ext = os.path.splitext(file.filename)[1]
    input_filename = f"{task_id}_input{ext}"
    output_filename = f"{task_id}_output.wav"
    
    input_path = os.path.join(UPLOAD_DIR, input_filename)
    output_path = os.path.join(PROCESSED_DIR, output_filename)
    
    with open(input_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    task = Task(
        id=task_id,
        filename=file.filename,
        status="pending",
        owner_id=current_user.id
    )
    db.add(task)
    db.commit()
    
    process_audio_task.delay(task_id, input_path, output_path)
    
    return {"task_id": task_id, "filename": file.filename, "status": "pending"}

from fastapi import Form
from typing import Optional

@app.post("/api/mix")
async def mix_tracks(
    files: list[UploadFile] = File(...),
    config: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if len(files) < 2:
        raise HTTPException(status_code=400, detail="至少需要上传2个音轨")
    
    if len(files) > 16:
        raise HTTPException(status_code=400, detail="最多支持16个音轨")
    
    for file in files:
        if not file.filename.lower().endswith(('.wav', '.mp3', '.flac', '.ogg', '.m4a')):
            raise HTTPException(status_code=400, detail=f"不支持的文件格式: {file.filename}")
    
    task_id = str(uuid.uuid4())
    
    input_files = []
    track_configs = []
    
    if config:
        try:
            config_data = json.loads(config)
            track_configs = config_data.get("tracks", [])
            mix_config = config_data
        except:
            mix_config = {}
    else:
        mix_config = {}
    
    for i, file in enumerate(files):
        ext = os.path.splitext(file.filename)[1]
        input_filename = f"{task_id}_track_{i}{ext}"
        input_path = os.path.join(UPLOAD_DIR, input_filename)
        
        with open(input_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        input_files.append(input_path)
        
        if i >= len(track_configs):
            track_configs.append({
                "track_index": i,
                "volume": 1.0,
                "pan": 0.0,
                "delay_ms": 0
            })
    
    mix_config["tracks"] = track_configs
    config_str = json.dumps(mix_config)
    
    output_filename = f"{task_id}_mix.wav"
    output_path = os.path.join(PROCESSED_DIR, output_filename)
    
    filenames = ", ".join([f.filename for f in files])
    
    task = Task(
        id=task_id,
        filename=f"混音: {filenames[:50]}...",
        status="pending",
        task_type="mix",
        config=config_str,
        owner_id=current_user.id
    )
    db.add(task)
    db.commit()
    
    process_mix_task.delay(task_id, input_files, output_path, config_str)
    
    return {
        "task_id": task_id,
        "filename": task.filename,
        "status": "pending",
        "track_count": len(files)
    }

@app.get("/api/tasks", response_model=list[TaskResponse])
def get_tasks(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    tasks = db.query(Task).filter(Task.owner_id == current_user.id).order_by(Task.created_at.desc()).all()
    return tasks

@app.get("/api/tasks/{task_id}", response_model=TaskResponse)
def get_task(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    task = db.query(Task).filter(Task.id == task_id, Task.owner_id == current_user.id).first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    return task

@app.delete("/api/tasks/{task_id}")
def cancel_task(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    task = db.query(Task).filter(Task.id == task_id, Task.owner_id == current_user.id).first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    if task.status in ["pending", "processing"]:
        from celery.result import AsyncResult
        from main import celery
        
        AsyncResult(task_id, app=celery).revoke(terminate=True, signal='SIGTERM')
        
        task.status = "cancelled"
        db.commit()
        
        cleanup_task_files(task_id)
    
    return {"status": "success", "message": "任务已取消"}

def cleanup_task_files(task_id: str):
    try:
        for filename in os.listdir(UPLOAD_DIR):
            if filename.startswith(f"{task_id}_"):
                filepath = os.path.join(UPLOAD_DIR, filename)
                if os.path.exists(filepath):
                    os.remove(filepath)
        
        for filename in os.listdir(PROCESSED_DIR):
            if filename.startswith(f"{task_id}_"):
                filepath = os.path.join(PROCESSED_DIR, filename)
                if os.path.exists(filepath):
                    os.remove(filepath)
    except Exception as e:
        print(f"清理文件失败 {task_id}: {e}")

@app.on_event("startup")
def cleanup_old_files():
    try:
        import time
        cutoff = time.time() - 7 * 24 * 3600
        
        for directory in [UPLOAD_DIR, PROCESSED_DIR]:
            if os.path.exists(directory):
                for filename in os.listdir(directory):
                    filepath = os.path.join(directory, filename)
                    if os.path.isfile(filepath) and os.path.getmtime(filepath) < cutoff:
                        os.remove(filepath)
                        print(f"清理旧文件: {filepath}")
    except Exception as e:
        print(f"启动时清理文件失败: {e}")

@app.get("/api/download/{task_id}")
async def download_processed(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    task = db.query(Task).filter(Task.id == task_id, Task.owner_id == current_user.id).first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    if task.status != "completed":
        raise HTTPException(status_code=400, detail="任务尚未完成")
    
    output_path = os.path.join(PROCESSED_DIR, f"{task_id}_output.wav")
    if not os.path.exists(output_path):
        raise HTTPException(status_code=404, detail="处理后的文件不存在")
    
    original_name = os.path.splitext(task.filename)[0]
    return FileResponse(output_path, filename=f"{original_name}_processed.wav")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
