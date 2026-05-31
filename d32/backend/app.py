from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import uuid
from datetime import datetime
from PIL import Image
import io
import numpy as np
import psycopg2
from dotenv import load_dotenv
from ultralytics import YOLO
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = '../uploads'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg'}
ALLOWED_MIME_TYPES = {'image/jpeg', 'image/png', 'image/jpg'}
MAX_FILE_SIZE = 10 * 1024 * 1024

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_FILE_SIZE

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

DB_CONFIG = {
    'dbname': os.getenv('DB_NAME', 'industrial_inspection'),
    'user': os.getenv('DB_USER', 'postgres'),
    'password': os.getenv('DB_PASSWORD', 'postgres'),
    'host': os.getenv('DB_HOST', 'localhost'),
    'port': os.getenv('DB_PORT', '5432')
}

yolo_model = None

def load_yolo_model():
    global yolo_model
    model_path = '../models/best.pt'
    if os.path.exists(model_path):
        yolo_model = YOLO(model_path)
    else:
        yolo_model = YOLO('yolov8n.pt')

def get_db_connection():
    return psycopg2.connect(**DB_CONFIG)

def init_db():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute('''
        CREATE TABLE IF NOT EXISTS inspections (
            id SERIAL PRIMARY KEY,
            image_path VARCHAR(255),
            frontend_result VARCHAR(50),
            backend_result VARCHAR(50),
            defect_type VARCHAR(100),
            confidence FLOAT,
            position_x FLOAT DEFAULT 0,
            position_y FLOAT DEFAULT 0,
            workstation VARCHAR(50),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    cur.execute('''
        CREATE TABLE IF NOT EXISTS defect_heatmap_cache (
            id SERIAL PRIMARY KEY,
            cache_key VARCHAR(100) UNIQUE,
            data JSONB,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    conn.commit()
    cur.close()
    conn.close()

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def validate_image(file):
    try:
        file_content = file.read()
        file.seek(0)
        
        if len(file_content) == 0:
            return False, 'Empty file'
        
        if len(file_content) > MAX_FILE_SIZE:
            return False, 'File too large'
        
        try:
            img = Image.open(io.BytesIO(file_content))
            img.verify()
            
            if img.format.lower() not in {'jpeg', 'png', 'jpg'}:
                return False, f'Invalid image format: {img.format}'
            
            file.seek(0)
            return True, 'Valid image'
        except Exception as e:
            return False, f'Invalid image: {str(e)}'
    except Exception as e:
        return False, str(e)

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'healthy', 'timestamp': datetime.now().isoformat()})

@app.route('/api/inspect', methods=['POST'])
def inspect_image():
    if 'image' not in request.files:
        logger.warning('No image file in request')
        return jsonify({'error': 'No image file provided'}), 400
    
    file = request.files['image']
    if file.filename == '':
        logger.warning('Empty filename')
        return jsonify({'error': 'No file selected'}), 400
    
    logger.info(f'Received file: {file.filename}, content-type: {file.content_type}')
    
    is_valid, validation_msg = validate_image(file)
    if not is_valid:
        logger.warning(f'Image validation failed: {validation_msg}')
        return jsonify({'error': f'Invalid image: {validation_msg}'}), 400
    
    ext = 'jpg'
    if file.content_type == 'image/png':
        ext = 'png'
    
    filename = f"{uuid.uuid4()}.{ext}"
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    
    try:
        file.save(filepath)
        logger.info(f'Image saved to: {filepath}')
    except Exception as e:
        logger.error(f'Failed to save image: {str(e)}')
        return jsonify({'error': f'Failed to save image: {str(e)}'}), 500
    
    frontend_result = request.form.get('frontend_result', 'unknown')
    position_x = float(request.form.get('position_x', 0)) or 0
    position_y = float(request.form.get('position_y', 0)) or 0
    workstation = request.form.get('workstation', 'A1')
    
    try:
        if yolo_model is None:
            load_yolo_model()
        
        results = yolo_model(filepath)
        result = results[0]
        
        has_defect = len(result.boxes) > 0
        backend_result = 'defective' if has_defect else 'normal'
        defect_type = None
        confidence = 0.0
        
        if has_defect:
            names = result.names
            boxes = result.boxes
            max_conf_idx = boxes.conf.argmax()
            defect_type = names[int(boxes.cls[max_conf_idx])]
            confidence = float(boxes.conf[max_conf_idx])
        
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            'INSERT INTO inspections (image_path, frontend_result, backend_result, defect_type, confidence, position_x, position_y, workstation) VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id',
            (filename, frontend_result, backend_result, defect_type, confidence, position_x, position_y, workstation)
        )
        inspection_id = cur.fetchone()[0]
        conn.commit()
        cur.close()
        conn.close()
        
        logger.info(f'Inspection completed: {inspection_id}, result: {backend_result}')
        
        return jsonify({
            'id': inspection_id,
            'image_path': filename,
            'frontend_result': frontend_result,
            'backend_result': backend_result,
            'defect_type': defect_type,
            'confidence': confidence,
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        logger.error(f'Processing error: {str(e)}')
        if os.path.exists(filepath):
            os.remove(filepath)
        return jsonify({'error': f'Processing failed: {str(e)}'}), 500

@app.route('/api/inspections', methods=['GET'])
def get_inspections():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute('SELECT * FROM inspections ORDER BY created_at DESC LIMIT 50')
    rows = cur.fetchall()
    cur.close()
    conn.close()
    
    inspections = []
    for row in rows:
        inspections.append({
            'id': row[0],
            'image_path': row[1],
            'frontend_result': row[2],
            'backend_result': row[3],
            'defect_type': row[4],
            'confidence': row[5],
            'position_x': row[6],
            'position_y': row[7],
            'workstation': row[8],
            'created_at': row[9].isoformat() if row[9] else None
        })
    
    return jsonify(inspections)

@app.route('/api/heatmap', methods=['GET'])
def get_heatmap_data():
    days = request.args.get('days', 7, type=int)
    defect_type = request.args.get('defect_type', None)
    
    conn = get_db_connection()
    cur = conn.cursor()
    
    query = '''
        SELECT position_x, position_y, defect_type, COUNT(*) as count,
               AVG(confidence) as avg_confidence
        FROM inspections
        WHERE backend_result = 'defective'
          AND created_at >= NOW() - INTERVAL '%s days'
    '''
    params = [days]
    
    if defect_type:
        query += ' AND defect_type = %s'
        params.append(defect_type)
    
    query += '''
        GROUP BY position_x, position_y, defect_type
        ORDER BY count DESC
    '''
    
    cur.execute(query, params)
    rows = cur.fetchall()
    
    heatmap_data = []
    for row in rows:
        heatmap_data.append({
            'x': float(row[0]) if row[0] else 0,
            'y': float(row[1]) if row[1] else 0,
            'defect_type': row[2],
            'count': row[3],
            'value': row[3],
            'avg_confidence': float(row[4]) if row[4] else 0
        })
    
    cur.execute('''
        SELECT defect_type, COUNT(*) as count
        FROM inspections
        WHERE backend_result = 'defective'
          AND created_at >= NOW() - INTERVAL '%s days'
        GROUP BY defect_type
        ORDER BY count DESC
    ''', [days])
    
    type_rows = cur.fetchall()
    defect_types = []
    for row in type_rows:
        defect_types.append({
            'type': row[0],
            'count': row[1]
        })
    
    cur.execute('''
        SELECT workstation, COUNT(*) as count
        FROM inspections
        WHERE backend_result = 'defective'
          AND created_at >= NOW() - INTERVAL '%s days'
        GROUP BY workstation
        ORDER BY count DESC
    ''', [days])
    
    ws_rows = cur.fetchall()
    workstations = []
    for row in ws_rows:
        workstations.append({
            'workstation': row[0],
            'count': row[1]
        })
    
    cur.close()
    conn.close()
    
    return jsonify({
        'heatmap': heatmap_data,
        'defect_types': defect_types,
        'workstations': workstations,
        'time_range_days': days
    })

@app.route('/api/generate-test-data', methods=['POST'])
def generate_test_data():
    count = request.args.get('count', 50, type=int)
    
    conn = get_db_connection()
    cur = conn.cursor()
    
    defect_types = ['scratch', 'crack', 'dent', 'stain', 'deformation', 'missing_part']
    workstations = ['A1', 'A2', 'A3', 'B1', 'B2', 'C1', 'C2', 'C3']
    
    import random
    from datetime import datetime, timedelta
    
    for i in range(count):
        is_defective = random.random() > 0.3
        
        x = round(random.uniform(0, 10), 2)
        y = round(random.uniform(0, 10), 2)
        workstation = random.choice(workstations)
        defect_type = random.choice(defect_types) if is_defective else None
        confidence = round(random.uniform(0.7, 0.98), 2) if is_defective else 0
        
        days_ago = random.randint(0, 7)
        created_at = datetime.now() - timedelta(days=days_ago, hours=random.randint(0, 23))
        
        cur.execute('''
            INSERT INTO inspections 
            (image_path, frontend_result, backend_result, defect_type, confidence, 
             position_x, position_y, workstation, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ''', (
            f'test_{i}.jpg',
            'suspicious' if is_defective else 'normal',
            'defective' if is_defective else 'normal',
            defect_type,
            confidence,
            x, y, workstation, created_at
        ))
    
    conn.commit()
    cur.close()
    conn.close()
    
    return jsonify({'message': f'Generated {count} test records', 'status': 'success'})

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

if __name__ == '__main__':
    init_db()
    load_yolo_model()
    app.run(debug=True, host='0.0.0.0', port=5000)
