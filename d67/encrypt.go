package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const (
	xorKey    = 0x42
	encSuffix = ".enc"
)

func xorEncryptDecrypt(data []byte) []byte {
	result := make([]byte, len(data))
	for i := range data {
		result[i] = data[i] ^ xorKey
	}
	return result
}

func main() {
	if len(os.Args) < 3 {
		fmt.Printf("Usage: %s <input_file> <output_file_or_directory>\n", os.Args[0])
		fmt.Println("\nExamples:")
		fmt.Printf("  %s hello.txt encrypted_storage/          # Creates encrypted_storage/hello.txt.enc\n", os.Args[0])
		fmt.Printf("  %s hello.txt encrypted_storage/secret.txt # Creates encrypted_storage/secret.txt.enc\n", os.Args[0])
		os.Exit(1)
	}

	inputFile := os.Args[1]
	outputArg := os.Args[2]

	data, err := os.ReadFile(inputFile)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error reading input file: %v\n", err)
		os.Exit(1)
	}

	encrypted := xorEncryptDecrypt(data)

	var outputFile string
	if info, err := os.Stat(outputArg); err == nil && info.IsDir() {
		baseName := filepath.Base(inputFile)
		outputFile = filepath.Join(outputArg, baseName+encSuffix)
	} else {
		if strings.HasSuffix(outputArg, encSuffix) {
			outputFile = outputArg
		} else {
			outputFile = outputArg + encSuffix
		}
	}

	if err := os.MkdirAll(filepath.Dir(outputFile), 0755); err != nil {
		fmt.Fprintf(os.Stderr, "Error creating output directory: %v\n", err)
		os.Exit(1)
	}

	if err := os.WriteFile(outputFile, encrypted, 0644); err != nil {
		fmt.Fprintf(os.Stderr, "Error writing output file: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Successfully encrypted '%s' to '%s'\n", inputFile, outputFile)
	fmt.Printf("When mounted, you will see: '%s' (without .enc suffix)\n",
		strings.TrimSuffix(filepath.Base(outputFile), encSuffix))
}
