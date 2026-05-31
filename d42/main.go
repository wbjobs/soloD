package main

import (
	"bufio"
	"compress/gzip"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
)

const (
	maxScanBufferSize = 1024 * 1024 * 10
)

type FastqRecord struct {
	Header    string
	Sequence  string
	Plus      string
	Qualities []int
}

type Stats struct {
	TotalReads     int
	FilteredReads  int
	TotalBases     int
	Q20Bases       int
	Q30Bases       int
	GCCount        int
	PositionSums   []int64
	PositionQ20    []int
	PositionQ30    []int
	PositionCounts []int
	MaxSeqLen      int
}

type ProcessResult struct {
	Stats         Stats
	PassedRecords []RawRecord
}

type RawRecord struct {
	Header   string
	Sequence string
	Plus     string
	QualStr  string
}

func main() {
	if len(os.Args) < 2 {
		printUsage()
		os.Exit(1)
	}

	if os.Args[1] == "-h" || os.Args[1] == "--help" {
		printUsage()
		os.Exit(0)
	}

	inputFile := os.Args[1]
	outputFile := ""
	filterEnabled := true
	minQuality := 20.0
	numThreads := runtime.NumCPU()

	for i := 2; i < len(os.Args); i++ {
		switch os.Args[i] {
		case "-o", "--output":
			if i+1 < len(os.Args) {
				outputFile = os.Args[i+1]
				i++
			}
		case "-q", "--min-quality":
			if i+1 < len(os.Args) {
				if q, err := strconv.ParseFloat(os.Args[i+1], 64); err == nil {
					minQuality = q
					i++
				}
			}
		case "-t", "--threads":
			if i+1 < len(os.Args) {
				if t, err := strconv.Atoi(os.Args[i+1]); err == nil && t > 0 {
					numThreads = t
					i++
				}
			}
		case "--no-filter":
			filterEnabled = false
		case "-h", "--help":
			printUsage()
			os.Exit(0)
		}
	}

	fmt.Printf("Using %d threads for processing\n\n", numThreads)

	stats, err := processFastqParallel(inputFile, outputFile, filterEnabled, minQuality, numThreads)
	if err != nil {
		fmt.Printf("Error processing FASTQ file: %v\n", err)
		os.Exit(1)
	}

	printReport(stats, minQuality, filterEnabled)

	if filterEnabled && outputFile != "" {
		fmt.Printf("\nFiltered sequences written to: %s\n", outputFile)
	}
}

func printUsage() {
	fmt.Println("FASTQ Processor - A tool for processing FASTQ files")
	fmt.Println("\nUsage:")
	fmt.Printf("  %s <input.fastq[.gz]> [options]\n", filepath.Base(os.Args[0]))
	fmt.Println("\nOptions:")
	fmt.Println("  -o, --output <file>       Output file for filtered sequences")
	fmt.Println("  -q, --min-quality <q>      Minimum average quality (default: 20)")
	fmt.Println("  -t, --threads <n>          Number of processing threads (default: CPU cores)")
	fmt.Println("  --no-filter                 Disable filtering, only generate statistics")
	fmt.Println("  -h, --help                 Show this help message")
	fmt.Println("\nSupported formats:")
	fmt.Println("  - Uncompressed FASTQ (.fastq, .fq)")
	fmt.Println("  - GZIP compressed FASTQ (.fastq.gz, .fq.gz)")
}

func isGzipFile(filename string) bool {
	return strings.HasSuffix(filename, ".gz")
}

func getScanner(filename string) (*bufio.Scanner, io.ReadCloser, error) {
	file, err := os.Open(filename)
	if err != nil {
		return nil, nil, err
	}

	var reader io.ReadCloser = file

	if isGzipFile(filename) {
		gzReader, err := gzip.NewReader(file)
		if err != nil {
			file.Close()
			return nil, nil, err
		}
		reader = &gzipReadCloser{gzReader, file}
	}

	scanner := bufio.NewScanner(reader)
	buf := make([]byte, maxScanBufferSize)
	scanner.Buffer(buf, maxScanBufferSize)

	return scanner, reader, nil
}

type gzipReadCloser struct {
	gzReader *gzip.Reader
	file     *os.File
}

func (g *gzipReadCloser) Read(p []byte) (n int, err error) {
	return g.gzReader.Read(p)
}

func (g *gzipReadCloser) Close() error {
	err1 := g.gzReader.Close()
	err2 := g.file.Close()
	if err1 != nil {
		return err1
	}
	return err2
}

func processFastqParallel(inputFile, outputFile string, filterEnabled bool, minQuality float64, numThreads int) (Stats, error) {
	scanner, reader, err := getScanner(inputFile)
	if err != nil {
		return Stats{}, err
	}
	defer reader.Close()

	var outputWriter *bufio.Writer
	var outputFileHandle *os.File
	if filterEnabled && outputFile != "" {
		outputFileHandle, err = os.Create(outputFile)
		if err != nil {
			return Stats{}, err
		}
		defer outputFileHandle.Close()
		outputWriter = bufio.NewWriter(outputFileHandle)
		defer outputWriter.Flush()
	}

	recordChan := make(chan RawRecord, numThreads*100)
	resultChan := make(chan ProcessResult, numThreads)
	var wg sync.WaitGroup

	for i := 0; i < numThreads; i++ {
		wg.Add(1)
		go worker(recordChan, resultChan, &wg, filterEnabled, minQuality)
	}

	go readRecords(scanner, recordChan)

	go func() {
		wg.Wait()
		close(resultChan)
	}()

	finalStats := Stats{
		PositionSums:   make([]int64, 0, 1000),
		PositionQ20:    make([]int, 0, 1000),
		PositionQ30:    make([]int, 0, 1000),
		PositionCounts: make([]int, 0, 1000),
	}

	for result := range resultChan {
		mergeStats(&finalStats, &result.Stats)

		if outputWriter != nil && len(result.PassedRecords) > 0 {
			for _, rec := range result.PassedRecords {
				fmt.Fprintln(outputWriter, rec.Header)
				fmt.Fprintln(outputWriter, rec.Sequence)
				fmt.Fprintln(outputWriter, rec.Plus)
				fmt.Fprintln(outputWriter, rec.QualStr)
			}
		}
	}

	if err := scanner.Err(); err != nil {
		return finalStats, err
	}

	return finalStats, nil
}

func readRecords(scanner *bufio.Scanner, recordChan chan<- RawRecord) {
	lineCount := 0
	var rec RawRecord

	for scanner.Scan() {
		line := scanner.Text()
		switch lineCount % 4 {
		case 0:
			rec.Header = line
		case 1:
			rec.Sequence = line
		case 2:
			rec.Plus = line
		case 3:
			rec.QualStr = line
			recordChan <- rec
		}
		lineCount++
	}

	close(recordChan)
}

func worker(recordChan <-chan RawRecord, resultChan chan<- ProcessResult, wg *sync.WaitGroup, filterEnabled bool, minQuality float64) {
	defer wg.Done()

	localStats := Stats{
		PositionSums:   make([]int64, 0, 1000),
		PositionQ20:    make([]int, 0, 1000),
		PositionQ30:    make([]int, 0, 1000),
		PositionCounts: make([]int, 0, 1000),
	}

	var passedRecords []RawRecord

	for rec := range recordChan {
		qualities := make([]int, len(rec.QualStr))
		for i, c := range rec.QualStr {
			qualities[i] = int(c) - 33
		}

		passesFilter := true
		if filterEnabled {
			avgQuality := calculateAvgQuality(qualities)
			passesFilter = avgQuality >= minQuality
			if !passesFilter {
				localStats.FilteredReads++
			}
		}

		if passesFilter {
			passedRecords = append(passedRecords, rec)
		}

		updateStatsLocal(&localStats, rec.Sequence, qualities)
	}

	resultChan <- ProcessResult{
		Stats:         localStats,
		PassedRecords: passedRecords,
	}
}

func updateStatsLocal(stats *Stats, sequence string, qualities []int) {
	stats.TotalReads++
	seqLen := len(qualities)

	if seqLen > stats.MaxSeqLen {
		needExpand := seqLen - len(stats.PositionSums)
		if needExpand > 0 {
			stats.PositionSums = append(stats.PositionSums, make([]int64, needExpand)...)
			stats.PositionQ20 = append(stats.PositionQ20, make([]int, needExpand)...)
			stats.PositionQ30 = append(stats.PositionQ30, make([]int, needExpand)...)
			stats.PositionCounts = append(stats.PositionCounts, make([]int, needExpand)...)
		}
		stats.MaxSeqLen = seqLen
	}

	for i, q := range qualities {
		stats.PositionSums[i] += int64(q)
		stats.PositionCounts[i]++
		stats.TotalBases++
		if q >= 20 {
			stats.PositionQ20[i]++
			stats.Q20Bases++
		}
		if q >= 30 {
			stats.PositionQ30[i]++
			stats.Q30Bases++
		}
	}

	for _, c := range sequence {
		if c == 'G' || c == 'C' || c == 'g' || c == 'c' {
			stats.GCCount++
		}
	}
}

func mergeStats(dest, src *Stats) {
	dest.TotalReads += src.TotalReads
	dest.FilteredReads += src.FilteredReads
	dest.TotalBases += src.TotalBases
	dest.Q20Bases += src.Q20Bases
	dest.Q30Bases += src.Q30Bases
	dest.GCCount += src.GCCount

	if src.MaxSeqLen > dest.MaxSeqLen {
		needExpand := src.MaxSeqLen - len(dest.PositionSums)
		if needExpand > 0 {
			dest.PositionSums = append(dest.PositionSums, make([]int64, needExpand)...)
			dest.PositionQ20 = append(dest.PositionQ20, make([]int, needExpand)...)
			dest.PositionQ30 = append(dest.PositionQ30, make([]int, needExpand)...)
			dest.PositionCounts = append(dest.PositionCounts, make([]int, needExpand)...)
		}
		dest.MaxSeqLen = src.MaxSeqLen
	}

	for i := 0; i < src.MaxSeqLen; i++ {
		dest.PositionSums[i] += src.PositionSums[i]
		dest.PositionQ20[i] += src.PositionQ20[i]
		dest.PositionQ30[i] += src.PositionQ30[i]
		dest.PositionCounts[i] += src.PositionCounts[i]
	}
}

func calculateAvgQuality(qualities []int) float64 {
	if len(qualities) == 0 {
		return 0
	}
	sum := 0
	for _, q := range qualities {
		sum += q
	}
	return float64(sum) / float64(len(qualities))
}

func printReport(stats Stats, minQuality float64, filterEnabled bool) {
	fmt.Println(strings.Repeat("=", 60))
	fmt.Println("           FASTQ Quality Statistics Report")
	fmt.Println(strings.Repeat("=", 60))
	fmt.Printf("\nTotal reads: %d\n", stats.TotalReads)
	fmt.Printf("Total bases: %d\n", stats.TotalBases)
	if filterEnabled {
		fmt.Printf("Reads filtered (avg < Q%.0f): %d (%.2f%%)\n", minQuality, stats.FilteredReads, float64(stats.FilteredReads)/float64(stats.TotalReads)*100)
		fmt.Printf("Reads retained: %d (%.2f%%)\n", stats.TotalReads-stats.FilteredReads, float64(stats.TotalReads-stats.FilteredReads)/float64(stats.TotalReads)*100)
	}
	fmt.Printf("\nQuality Summary:\n")
	fmt.Printf("  Q20 bases: %d (%.2f%%)\n", stats.Q20Bases, float64(stats.Q20Bases)/float64(stats.TotalBases)*100)
	fmt.Printf("  Q30 bases: %d (%.2f%%)\n", stats.Q30Bases, float64(stats.Q30Bases)/float64(stats.TotalBases)*100)
	gcContent := float64(0)
	if stats.TotalBases > 0 {
		gcContent = float64(stats.GCCount) / float64(stats.TotalBases) * 100
	}
	fmt.Printf("  GC Content: %.2f%%\n", gcContent)
	fmt.Println("\n" + strings.Repeat("-", 60))
	fmt.Println("Per-base Quality Statistics (first 20 positions):")
	fmt.Printf("%-10s %-15s %-15s %-15s\n", "Position", "Avg Quality", "Q20 Rate", "Q30 Rate")
	fmt.Println(strings.Repeat("-", 60))

	displayPos := stats.MaxSeqLen
	if displayPos > 20 {
		displayPos = 20
	}

	for i := 0; i < displayPos; i++ {
		if stats.PositionCounts[i] > 0 {
			avgQ := float64(stats.PositionSums[i]) / float64(stats.PositionCounts[i])
			q20Rate := float64(stats.PositionQ20[i]) / float64(stats.PositionCounts[i]) * 100
			q30Rate := float64(stats.PositionQ30[i]) / float64(stats.PositionCounts[i]) * 100
			fmt.Printf("%-10d %-15.2f %-15.2f %-15.2f\n", i+1, avgQ, q20Rate, q30Rate)
		}
	}

	if stats.MaxSeqLen > 20 {
		fmt.Printf("\n... (showing first 20 of %d positions)\n", stats.MaxSeqLen)
	}
}
