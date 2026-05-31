package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
	"syscall"

	"bazil.org/fuse"
	"bazil.org/fuse/fs"
)

const (
	xorKey      = 0x42
	encSuffix   = ".enc"
)

func xorEncryptDecrypt(data []byte) []byte {
	result := make([]byte, len(data))
	for i := range data {
		result[i] = data[i] ^ xorKey
	}
	return result
}

func toInternalName(name string) string {
	if name == "" {
		return ""
	}
	return name + encSuffix
}

func toExternalName(name string) string {
	return strings.TrimSuffix(name, encSuffix)
}

type CryptoFS struct {
	root       string
	mountPoint string
	conn       *fuse.Conn
	verbose    bool
}

type Dir struct {
	cfs  *CryptoFS
	path string
}

type File struct {
	cfs  *CryptoFS
	path string
	mu   sync.Mutex
	data []byte
}

func main() {
	var verbose bool
	flag.BoolVar(&verbose, "v", false, "Enable verbose access logging")
	
	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, "Usage: %s [OPTIONS] encrypted_storage mount_point\n\n", os.Args[0])
		fmt.Fprintf(os.Stderr, "A read-only FUSE filesystem that decrypts files on-the-fly using XOR.\n")
		fmt.Fprintf(os.Stderr, "Files with .enc suffix are shown without the suffix in the mount point.\n\n")
		fmt.Fprintf(os.Stderr, "Options:\n")
		flag.PrintDefaults()
	}
	
	flag.Parse()
	if flag.NArg() != 2 {
		flag.Usage()
		os.Exit(1)
	}

	encryptedDir := flag.Arg(0)
	mountPoint := flag.Arg(1)

	absEncryptedDir, err := filepath.Abs(encryptedDir)
	if err != nil {
		log.Fatalf("Failed to get absolute path for encrypted directory: %v", err)
	}

	absMountPoint, err := filepath.Abs(mountPoint)
	if err != nil {
		log.Fatalf("Failed to get absolute path for mount point: %v", err)
	}

	if err := os.MkdirAll(absEncryptedDir, 0755); err != nil {
		log.Fatalf("Failed to create encrypted directory: %v", err)
	}

	if err := os.MkdirAll(absMountPoint, 0755); err != nil {
		log.Fatalf("Failed to create mount point: %v", err)
	}

	log.Printf("Unmounting any existing filesystem at %s...", absMountPoint)
	unmount(absMountPoint)

	log.Printf("Mounting CryptoFS...")
	c, err := fuse.Mount(
		absMountPoint,
		fuse.FSName("cryptofs"),
		fuse.Subtype("cryptofs"),
		fuse.ReadOnly(),
		fuse.AllowOther(),
	)
	if err != nil {
		log.Fatalf("Failed to mount: %v", err)
	}

	cfs := &CryptoFS{
		root:       absEncryptedDir,
		mountPoint: absMountPoint,
		conn:       c,
		verbose:    verbose,
	}

	if verbose {
		log.Println("Verbose access logging enabled")
	}

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-sigChan
		log.Println("\nReceived interrupt, unmounting...")
		unmount(absMountPoint)
		os.Exit(0)
	}()

	log.Printf("=" + strings.Repeat("=", 58))
	log.Printf("CryptoFS mounted successfully!")
	log.Printf("  Encrypted storage: %s", absEncryptedDir)
	log.Printf("  Mount point:       %s", absMountPoint)
	log.Printf("  Press Ctrl+C to unmount")
	log.Printf("=" + strings.Repeat("=", 58))
	log.Println("")
	log.Println("Test commands (in another terminal):")
	log.Printf("  ls -la %s", absMountPoint)
	log.Printf("  cat %s/<filename>          # Auto-decrypts .enc files", absMountPoint)
	log.Printf("  touch %s/test.txt          # Should fail: Operation not permitted", absMountPoint)
	log.Printf("  rm %s/<filename>           # Should fail: Operation not permitted", absMountPoint)
	log.Println("")

	if err := fs.Serve(c, cfs); err != nil {
		log.Fatalf("Failed to serve filesystem: %v", err)
	}
}

func unmount(mountPoint string) {
	_ = syscall.Unmount(mountPoint, 0)
	_ = syscall.Unmount(mountPoint, syscall.MNT_FORCE)
}

func (cfs *CryptoFS) Root() (fs.Node, error) {
	return &Dir{cfs: cfs, path: ""}, nil
}

func (d *Dir) Attr(ctx context.Context, a *fuse.Attr) error {
	fullPath := filepath.Join(d.cfs.root, d.path)
	info, err := os.Stat(fullPath)
	if err != nil {
		return err
	}
	a.Inode = inodeFromPath(d.path)
	a.Mode = os.ModeDir | 0555
	a.Size = uint64(info.Size())
	a.Mtime = info.ModTime()
	a.Uid = uint32(os.Getuid())
	a.Gid = uint32(os.Getgid())
	return nil
}

func (d *Dir) Lookup(ctx context.Context, name string) (fs.Node, error) {
	internalName := toInternalName(name)
	fullPath := filepath.Join(d.cfs.root, d.path, internalName)
	
	info, err := os.Stat(fullPath)
	if os.IsNotExist(err) {
		fullPathNoEnc := filepath.Join(d.cfs.root, d.path, name)
		info, err = os.Stat(fullPathNoEnc)
		if os.IsNotExist(err) {
			return nil, syscall.ENOENT
		}
		if err != nil {
			return nil, err
		}
		internalName = name
	} else if err != nil {
		return nil, err
	}

	if info.IsDir() {
		return &Dir{cfs: d.cfs, path: filepath.Join(d.path, internalName)}, nil
	}
	return &File{cfs: d.cfs, path: filepath.Join(d.path, internalName)}, nil
}

func (d *Dir) ReadDirAll(ctx context.Context) ([]fuse.Dirent, error) {
	fullPath := filepath.Join(d.cfs.root, d.path)
	files, err := os.ReadDir(fullPath)
	if err != nil {
		return nil, err
	}

	var entries []fuse.Dirent
	for _, f := range files {
		externalName := toExternalName(f.Name())
		ent := fuse.Dirent{
			Inode: inodeFromPath(filepath.Join(d.path, f.Name())),
			Name:  externalName,
		}
		if f.IsDir() {
			ent.Type = fuse.DT_Dir
		} else {
			ent.Type = fuse.DT_File
		}
		entries = append(entries, ent)
	}
	return entries, nil
}

func (f *File) Attr(ctx context.Context, a *fuse.Attr) error {
	fullPath := filepath.Join(f.cfs.root, f.path)
	info, err := os.Stat(fullPath)
	if err != nil {
		return err
	}
	a.Inode = inodeFromPath(f.path)
	a.Mode = 0444
	a.Size = uint64(info.Size())
	a.Mtime = info.ModTime()
	a.Uid = uint32(os.Getuid())
	a.Gid = uint32(os.Getgid())
	return nil
}

func (f *File) Read(ctx context.Context, req *fuse.ReadRequest, resp *fuse.ReadResponse) error {
	f.mu.Lock()
	defer f.mu.Unlock()

	if f.data == nil {
		fullPath := filepath.Join(f.cfs.root, f.path)
		encryptedData, err := os.ReadFile(fullPath)
		if err != nil {
			return err
		}
		f.data = xorEncryptDecrypt(encryptedData)

		if f.cfs.verbose {
			displayName := toExternalName(filepath.Base(f.path))
			log.Printf("ACCESSED: %s", displayName)
		}
	}

	size := len(f.data)
	if req.Offset >= int64(size) {
		resp.Data = nil
		return nil
	}

	end := int(req.Offset) + req.Size
	if end > size {
		end = size
	}
	resp.Data = f.data[req.Offset:end]
	return nil
}

func (f *File) Open(ctx context.Context, req *fuse.OpenRequest, resp *fuse.OpenResponse) (fs.Handle, error) {
	resp.Flags |= fuse.OpenDirectIO
	return f, nil
}

func (d *Dir) Create(ctx context.Context, req *fuse.CreateRequest, resp *fuse.CreateResponse) (fs.Node, fs.Handle, error) {
	log.Printf("Denied Create: %s", req.Name)
	return nil, nil, syscall.EPERM
}

func (d *Dir) Remove(ctx context.Context, req *fuse.RemoveRequest) error {
	log.Printf("Denied Remove: %s", req.Name)
	return syscall.EPERM
}

func (d *Dir) Mkdir(ctx context.Context, req *fuse.MkdirRequest) (fs.Node, error) {
	log.Printf("Denied Mkdir: %s", req.Name)
	return nil, syscall.EPERM
}

func (d *Dir) Rename(ctx context.Context, req *fuse.RenameRequest, newDir fs.Node) error {
	log.Printf("Denied Rename: %s -> %s", req.OldName, req.NewName)
	return syscall.EPERM
}

func (d *Dir) Link(ctx context.Context, req *fuse.LinkRequest, old fs.Node) (fs.Node, error) {
	log.Printf("Denied Link: %s", req.NewName)
	return nil, syscall.EPERM
}

func (d *Dir) Symlink(ctx context.Context, req *fuse.SymlinkRequest) (fs.Node, error) {
	log.Printf("Denied Symlink: %s -> %s", req.NewName, req.Target)
	return nil, syscall.EPERM
}

func (f *File) Setattr(ctx context.Context, req *fuse.SetattrRequest, resp *fuse.SetattrResponse) error {
	log.Printf("Denied Setattr")
	return syscall.EPERM
}

func (f *File) Write(ctx context.Context, req *fuse.WriteRequest, resp *fuse.WriteResponse) error {
	log.Printf("Denied Write")
	return syscall.EPERM
}

func (f *File) Fsync(ctx context.Context, req *fuse.FsyncRequest) error {
	log.Printf("Denied Fsync")
	return syscall.EPERM
}

func (f *File) Flush(ctx context.Context, req *fuse.FlushRequest) error {
	return nil
}

func (f *File) Release(ctx context.Context, req *fuse.ReleaseRequest) error {
	return nil
}

func (f *File) Readlink(ctx context.Context, req *fuse.ReadlinkRequest) (string, error) {
	return "", syscall.EINVAL
}

func (d *Dir) Statfs(ctx context.Context, req *fuse.StatfsRequest, resp *fuse.StatfsResponse) error {
	var stat syscall.Statfs_t
	if err := syscall.Statfs(d.cfs.root, &stat); err == nil {
		resp.Blocks = stat.Blocks
		resp.Bfree = stat.Bfree
		resp.Bavail = stat.Bavail
		resp.Files = stat.Files
		resp.Ffree = stat.Ffree
		resp.Bsize = uint32(stat.Bsize)
		resp.Namelen = uint32(stat.Namelen)
		resp.Frsize = uint32(stat.Frsize)
	}
	return nil
}

func inodeFromPath(path string) uint64 {
	var h uint64 = 0
	for _, c := range path {
		h = 31*h + uint64(c)
	}
	if h == 0 {
		h = 1
	}
	return h
}
