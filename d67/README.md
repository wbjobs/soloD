# CryptoFS - 加密 FUSE 文件系统

一个基于 Go 和 FUSE 实现的只读加密文件系统，文件在内存中实时解密，自动隐藏 `.enc` 后缀。

## ✨ 功能特性

- **文件名转换**: 自动隐藏 `.enc` 后缀，`secret.txt.enc` → 显示为 `secret.txt`
- **实时解密**: 从加密存储目录读取文件时，在内存中自动 XOR 解密
- **访问日志**: 支持 `-v` 参数，文件被读取时输出访问日志
- **严格只读**: 所有写操作（创建、删除、修改、重命名等）都返回 `Operation not permitted`
- **安全卸载**: 支持 Ctrl+C 自动卸载，支持信号处理
- **正确权限**: 设置正确的 UID/GID、权限

## 📁 项目结构

```
.
├── main.go              # FUSE 文件系统主程序
├── encrypt.go           # 文件加密工具（自动添加 .enc 后缀）
├── go.mod               # Go 模块依赖
├── run.sh               # 一键编译和准备脚本
├── test_file.txt       # 测试文件
├── encrypted_storage/   # 加密文件存储目录（存放 .enc 文件）
└── mount_point/         # FUSE 挂载点
```

## 🔧 前置要求

- **Linux**: 安装 `fuse` 包
  ```bash
  sudo apt-get install fuse   # Debian/Ubuntu
  sudo dnf install fuse      # Fedora/RHEL
  ```
- **Go 1.21+**: 用于编译程序

## 🚀 快速开始

### 第一步：编译和准备

```bash
chmod +x run.sh
./run.sh
```

### 第二步：挂载文件系统

**方法一：普通用户挂载（推荐）

```bash
sudo ./cryptofs encrypted_storage mount_point
```

**方法二：前台运行，指定挂载选项

```bash
sudo ./cryptofs encrypted_storage mount_point
```

程序会自动：
1. 先尝试卸载任何已存在的挂载
2. 使用 `fuse.ReadOnly()` 标记只读
3. 使用 `fuse.AllowOther()` 允许其他用户访问

### 第三步：测试文件系统

打开另一个终端：

```bash
# 列出文件 - 注意 .enc 后缀被隐藏了！
ls -la mount_point/
# 输出示例:
# -r--r--r-- 1 root root  123 May 15 10:00 secret.txt
# -r--r--r-- 1 root root   45 May 15 10:00 document.txt

# 但在 encrypted_storage 目录中实际是:
# secret.txt.enc 和 document.txt.enc

# 读取解密后的文件内容
cat mount_point/secret.txt
cat mount_point/document.txt

# 查看原始加密文件（不可直接查看是乱码）
cat encrypted_storage/secret.txt.enc
```

### 第四步：测试只读保护

```bash
# 尝试创建文件 - 应该失败
touch mount_point/new.txt
# 输出: touch: cannot touch 'mount_point/new.txt': Operation not permitted

# 尝试删除文件 - 应该失败
rm mount_point/secret.txt
# 输出: rm: cannot remove 'mount_point/secret.txt': Operation not permitted

# 尝试创建目录 - 应该失败
mkdir mount_point/subdir
# 输出: mkdir: cannot create directory 'mount_point/subdir': Operation not permitted

# 尝试重命名 - 应该失败
mv mount_point/secret.txt mount_point/other.txt
# 输出: mv: cannot move 'mount_point/secret.txt' to 'mount_point/other.txt': Operation not permitted

# 尝试写入 - 应该失败
echo "test" > mount_point/secret.txt
# 输出: bash: mount_point/secret.txt: Operation not permitted
```

### 第五步：卸载文件系统

#### 方法一：优雅卸载（推荐）
在运行程序的终端按 **`Ctrl+C`**

程序会自动捕获信号并卸载：
```
^C
2026/05/15 10:00:00 Received interrupt, unmounting...
```

#### 方法二：使用 fusermount（最可靠）
```bash
fusermount -u mount_point
```

#### 方法三：使用 umount（需要 root）
```bash
sudo umount mount_point
```

#### 方法四：强制卸载（挂载卡住时）
```bash
fusermount -uz mount_point
```

## 🔍 核心实现详解

### 1. 文件名转换（.enc 后缀隐藏

**转换函数 (`main.go:32-41`):

```go
const encSuffix = ".enc"

// 用户查找 "secret.txt" → 实际查找 "secret.txt.enc"
func toInternalName(name string) string {
    return name + encSuffix
}

// 显示给用户看时去掉 .enc
func toExternalName(name string) string {
    return strings.TrimSuffix(name, encSuffix)
}
```

### 2. Lookup 方法 - 文件查找

**Lookup 实现** (`main.go:170-193`):

```go
func (d *Dir) Lookup(ctx context.Context, name string) (fs.Node, error) {
    // 用户查找 "secret.txt" → 先尝试 "secret.txt.enc"
    internalName := toInternalName(name)
    fullPath := filepath.Join(d.cfs.root, d.path, internalName)
    
    info, err := os.Stat(fullPath)
    if os.IsNotExist(err) {
        // 如果 .enc 文件不存在，回退到原始文件名
        fullPathNoEnc := filepath.Join(d.cfs.root, d.path, name)
        info, err = os.Stat(fullPathNoEnc)
        ...
    }
    ...
}
```

### 3. Read 方法 - 透明解密

**Read 实现** (`main.go:234-259`):

```go
func (f *File) Read(ctx context.Context, req *fuse.ReadRequest, resp *fuse.ReadResponse) error {
    f.mu.Lock()
    defer f.mu.Unlock()

    if f.data == nil {
        // 读取加密文件
        fullPath := filepath.Join(f.cfs.root, f.path)
        encryptedData, err := os.ReadFile(fullPath)
        if err != nil {
            return err
        }
        // 在内存中解密
        f.data = xorEncryptDecrypt(encryptedData)
    }

    // 返回解密后的内容
    size := len(f.data)
    end := int(req.Offset) + req.Size
    if end > size {
        end = size
    }
    resp.Data = f.data[req.Offset:end]
    return nil
}
```

### 4. 写操作权限保护

所有写操作都返回 `syscall.EPERM` (`main.go:266-309`):

| 方法 | 说明 | 返回值 |
|------|------|--------|
| `Create()` | 创建文件 | `EPERM` |
| `Remove()` | 删除文件 | `EPERM` |
| `Mkdir()` | 创建目录 | `EPERM` |
| `Rename()` | 重命名 | `EPERM` |
| `Link()` | 硬链接 | `EPERM` |
| `Symlink()` | 符号链接 | `EPERM` |
| `Setattr()` | 修改属性 | `EPERM` |
| `Write()` | 写入内容 | `EPERM` |
| `Fsync()` | 同步 | `EPERM` |

```go
// 示例实现：
func (d *Dir) Create(ctx context.Context, req *fuse.CreateRequest, resp *fuse.CreateResponse) (fs.Node, fs.Handle, error) {
    log.Printf("Denied Create: %s", req.Name)
    return nil, nil, syscall.EPERM
}
```

### 5. 正确的挂载和卸载

**挂载** (`main.go:100-110`):

```go
c, err := fuse.Mount(
    absMountPoint,
    fuse.FSName("cryptofs"),
    fuse.Subtype("cryptofs"),
    fuse.ReadOnly(),       // 内核层面标记只读
    fuse.AllowOther(),     // 允许其他用户访问
)
```

**卸载** (`main.go:146-149`):

```go
func unmount(mountPoint string) {
    _ = syscall.Unmount(mountPoint, 0)
    _ = syscall.Unmount(mountPoint, syscall.MNT_FORCE)
}
```

**信号处理** (`main.go:118-125`):

```go
sigChan := make(chan os.Signal, 1)
signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
go func() {
    <-sigChan
    unmount(absMountPoint)
    os.Exit(0)
}()
```

## 🔐 加密算法

使用 XOR 对称加密（可替换为 AES）：

```go
const xorKey = 0x42

func xorEncryptDecrypt(data []byte) []byte {
    result := make([]byte, len(data))
    for i := range data {
        result[i] = data[i] ^ xorKey
    }
    return result
}
```

XOR 加密特点：
- 加密和解密是同一个操作
- 简单快速，但安全性较低
- 适合演示用途
- 生产环境建议替换为 AES-GCM

## 📊 工作原理

```
用户操作                     FUSE 内核
   ↓                          ↓
ls mount_point/secret.txt  →  Lookup("secret.txt")
                              ↓
                        转换: secret.txt → secret.txt.enc
                              ↓
                        从 encrypted_storage/ 读取
                              ↓
                        内存中 XOR 解密
                              ↓
                        返回解密后的内容给用户
```

## ❓ 常见问题

### Q: 挂载失败 "permission denied"
**A:** 使用 `sudo` 运行，或配置 `/etc/fuse.conf` 中的 `user_allow_other`**

### Q: 卸载失败 "device is busy"
**A:** 确保没有进程在使用挂载点目录，或使用强制卸载：
```bash
cd /tmp
fusermount -uz mount_point
```

### Q: 如何添加新的加密文件
**A:**
```bash
./encrypt myfile.txt encrypted_storage/
# 会创建 encrypted_storage/myfile.txt.enc
# 挂载点自动可见为 myfile.txt
```

### Q: 如何验证文件确实被加密
**A:**
```bash
# 直接查看加密文件是乱码
cat encrypted_storage/secret.txt.enc

# 通过挂载点查看是明文
cat mount_point/secret.txt
```

## 📝 命令速查表

| 操作 | 命令 | 说明 |
|------|------|------|
| 挂载（无日志） | `sudo ./cryptofs encrypted_storage mount_point` | 普通模式 |
| 挂载（有日志） | `sudo ./cryptofs -v encrypted_storage mount_point` | 启用访问日志 |
| 优雅卸载 | `Ctrl+C` | 在运行程序的终端 |
| 卸载 | `fusermount -u mount_point` | 推荐，普通用户 |
| 卸载 | `sudo umount mount_point` | 需要 root |
| 强制卸载 | `fusermount -uz mount_point` | 挂载卡住时 |
| 查看挂载 | `mount \| grep cryptofs` | 检查是否挂载成功 |
| 查看挂载 | `findmnt mount_point` | 查看挂载详情 |

## 🎯 技术栈

- **Go**: 编程语言
- **bazil.org/fuse**: FUSE Go 绑定库
- **XOR**: 对称加密算法
- **syscall**: Linux 系统调用
