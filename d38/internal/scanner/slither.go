package scanner

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"smart-contract-scanner/internal/config"
	"strings"
	"time"
)

type VulnerabilitySeverity string

const (
	SeverityCritical VulnerabilitySeverity = "critical"
	SeverityHigh     VulnerabilitySeverity = "high"
	SeverityMedium   VulnerabilitySeverity = "medium"
	SeverityLow      VulnerabilitySeverity = "low"
	SeverityInfo     VulnerabilitySeverity = "info"
)

type DiffStatus string

const (
	DiffStatusNew     DiffStatus = "new"
	DiffStatusRemoved DiffStatus = "removed"
	DiffStatusChanged DiffStatus = "changed"
	DiffStatusSame    DiffStatus = "same"
)

type ScanReport struct {
	ContractName string          `json:"contract_name"`
	Scanner      string          `json:"scanner"`
	Version      string          `json:"version"`
	ScanTime     string          `json:"scan_time"`
	Duration     string          `json:"duration"`
	Status       string          `json:"status"`
	Vulns        []Vulnerability `json:"vulnerabilities"`
	Summary      ScanSummary     `json:"summary"`
	Error        string          `json:"error,omitempty"`
	CodeHash     string          `json:"code_hash,omitempty"`
}

type Vulnerability struct {
	ID          string                `json:"id"`
	Type        string                `json:"type"`
	Check       string                `json:"check"`
	Severity    VulnerabilitySeverity `json:"severity"`
	Description string                `json:"description"`
	Impact      string                `json:"impact"`
	Confidence  string                `json:"confidence"`
	Location    SourceLocation        `json:"location"`
	FixSuggest  string                `json:"fix_suggestion"`
	Hash        string                `json:"hash,omitempty"`
}

type SourceLocation struct {
	File      string `json:"file"`
	Contract  string `json:"contract"`
	Function  string `json:"function"`
	LineStart int    `json:"line_start"`
	LineEnd   int    `json:"line_end"`
}

type ScanSummary struct {
	Total    int `json:"total"`
	Critical int `json:"critical"`
	High     int `json:"high"`
	Medium   int `json:"medium"`
	Low      int `json:"low"`
	Info     int `json:"info"`
}

type VersionCompareReport struct {
	CompareTime    string           `json:"compare_time"`
	OldVersion     VersionInfo      `json:"old_version"`
	NewVersion     VersionInfo      `json:"new_version"`
	DiffSummary    DiffSummary      `json:"diff_summary"`
	NewRisks       []Vulnerability  `json:"new_risks"`
	RemovedRisks   []Vulnerability  `json:"removed_risks"`
	UnchangedRisks []Vulnerability  `json:"unchanged_risks"`
	CodeDiff       []CodeDiffLine   `json:"code_diff,omitempty"`
	Status         string           `json:"status"`
	Message        string           `json:"message"`
}

type VersionInfo struct {
	FileName string      `json:"file_name"`
	CodeHash string      `json:"code_hash"`
	ScanTime string      `json:"scan_time"`
	Summary  ScanSummary `json:"summary"`
}

type DiffSummary struct {
	TotalNew       int `json:"total_new"`
	TotalRemoved   int `json:"total_removed"`
	TotalUnchanged int `json:"total_unchanged"`
	CriticalNew    int `json:"critical_new"`
	HighNew        int `json:"high_new"`
	MediumNew      int `json:"medium_new"`
	CriticalRemoved int `json:"critical_removed"`
	HighRemoved    int `json:"high_removed"`
}

type CodeDiffLine struct {
	LineNumber int    `json:"line_number"`
	Content    string `json:"content"`
	Status     string `json:"status"` // "added", "removed", "unchanged"
}

type Scanner struct {
	config *config.Config
}

func NewScanner(cfg *config.Config) *Scanner {
	return &Scanner{config: cfg}
}

func (s *Scanner) ScanSolidity(contractPath string) (*ScanReport, error) {
	startTime := time.Now()

	report := &ScanReport{
		Scanner:  "slither",
		Version:  "1.0.0",
		ScanTime: startTime.Format(time.RFC3339),
		Status:   "success",
	}

	if _, err := os.Stat(contractPath); os.IsNotExist(err) {
		report.Status = "failed"
		report.Error = "Contract file not found"
		return report, err
	}

	report.ContractName = filepath.Base(contractPath)

	codeBytes, err := os.ReadFile(contractPath)
	if err == nil {
		report.CodeHash = fmt.Sprintf("%x", sha256.Sum256(codeBytes))
	}

	tempDir := filepath.Dir(contractPath)
	jsonOutput := filepath.Join(tempDir, "slither-report.json")
	defer os.Remove(jsonOutput)

	timeout := time.Duration(s.config.ScanTimeout) * time.Second
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, s.config.SlitherPath,
		contractPath,
		"--json", jsonOutput,
		"--json-types", "detectors",
		"--exclude-optimization",
		"--exclude-informational",
	)

	cmd.Dir = tempDir
	cmd.Env = append(os.Environ(), "PYTHONUNBUFFERED=1")

	output, err := cmd.CombinedOutput()
	if ctx.Err() == context.DeadlineExceeded {
		report.Status = "timeout"
		report.Error = fmt.Sprintf("Scan timed out after %ds. The contract may be too complex or contain infinite loops.", s.config.ScanTimeout)
		return report, fmt.Errorf("scan timeout")
	}

	if err != nil {
		report.Status = "failed"
		report.Error = fmt.Sprintf("Slither execution failed: %s", truncateString(string(output), 500))
		return report, nil
	}

	jsonData, err := os.ReadFile(jsonOutput)
	if err != nil {
		report.Status = "failed"
		report.Error = fmt.Sprintf("Failed to read slither output: %s", err.Error())
		return report, nil
	}

	var slitherResult map[string]interface{}
	if err := json.Unmarshal(jsonData, &slitherResult); err != nil {
		report.Status = "failed"
		report.Error = fmt.Sprintf("Failed to parse slither JSON: %s", err.Error())
		return report, nil
	}

	report.Vulns = s.parseSlitherResults(slitherResult, contractPath)
	report.Summary = s.generateSummary(report.Vulns)
	report.Duration = time.Since(startTime).String()

	return report, nil
}

func (s *Scanner) parseSlitherResults(result map[string]interface{}, contractPath string) []Vulnerability {
	var vulns []Vulnerability

	resultsDetectors, ok := getNestedValue(result, "results").(map[string]interface{})
	if !ok {
		return vulns
	}

	detectors, ok := resultsDetectors["detectors"].([]interface{})
	if !ok {
		return vulns
	}

	for idx, d := range detectors {
		detector, ok := d.(map[string]interface{})
		if !ok {
			continue
		}

		check := getStringSafe(detector, "check")
		description := getStringSafe(detector, "description")
		impact := getStringSafe(detector, "impact")
		confidence := getStringSafe(detector, "confidence")

		vulnHash := generateVulnHash(check, description, impact)

		vuln := Vulnerability{
			ID:          fmt.Sprintf("VULN-%04d", idx+1),
			Check:       check,
			Type:        check,
			Description: description,
			Impact:      impact,
			Confidence:  confidence,
			Severity:    mapImpactToSeverity(impact),
			FixSuggest:  getFixSuggestion(check),
			Hash:        vulnHash,
		}

		elements, ok := detector["elements"].([]interface{})
		if ok && len(elements) > 0 {
			if elem, ok := elements[0].(map[string]interface{}); ok {
				sourceMapping, _ := getNestedValue(elem, "source_mapping").(map[string]interface{})
				if sourceMapping != nil {
					vuln.Location = SourceLocation{
						File:      filepath.Base(contractPath),
						Contract:  getStringSafe(elem, "type_specific_fields.parent.name"),
						Function:  getStringSafe(elem, "name"),
						LineStart: getIntSafe(sourceMapping, "lines.0"),
						LineEnd:   getIntSafe(sourceMapping, "lines.-1"),
					}
				}
			}
		}

		vulns = append(vulns, vuln)
	}

	return vulns
}

func (s *Scanner) CompareVersions(oldContractPath, newContractPath string) (*VersionCompareReport, error) {
	compareReport := &VersionCompareReport{
		CompareTime: time.Now().Format(time.RFC3339),
		Status:      "success",
		Message:     "Comparison completed successfully",
	}

	oldReport, err := s.ScanSolidity(oldContractPath)
	if err != nil {
		compareReport.Status = "failed"
		compareReport.Message = fmt.Sprintf("Failed to scan old version: %s", err.Error())
		return compareReport, err
	}

	if oldReport.Status != "success" {
		compareReport.Status = "failed"
		compareReport.Message = fmt.Sprintf("Old version scan failed: %s", oldReport.Error)
		return compareReport, fmt.Errorf(oldReport.Error)
	}

	newReport, err := s.ScanSolidity(newContractPath)
	if err != nil {
		compareReport.Status = "failed"
		compareReport.Message = fmt.Sprintf("Failed to scan new version: %s", err.Error())
		return compareReport, err
	}

	if newReport.Status != "success" {
		compareReport.Status = "failed"
		compareReport.Message = fmt.Sprintf("New version scan failed: %s", newReport.Error)
		return compareReport, fmt.Errorf(newReport.Error)
	}

	compareReport.OldVersion = VersionInfo{
		FileName: oldReport.ContractName,
		CodeHash: oldReport.CodeHash,
		ScanTime: oldReport.ScanTime,
		Summary:  oldReport.Summary,
	}

	compareReport.NewVersion = VersionInfo{
		FileName: newReport.ContractName,
		CodeHash: newReport.CodeHash,
		ScanTime: newReport.ScanTime,
		Summary:  newReport.Summary,
	}

	oldVulnMap := make(map[string]Vulnerability)
	for _, v := range oldReport.Vulns {
		oldVulnMap[v.Hash] = v
	}

	newVulnMap := make(map[string]Vulnerability)
	for _, v := range newReport.Vulns {
		newVulnMap[v.Hash] = v
	}

	for hash, newVuln := range newVulnMap {
		if _, exists := oldVulnMap[hash]; !exists {
			compareReport.NewRisks = append(compareReport.NewRisks, newVuln)
		} else {
			compareReport.UnchangedRisks = append(compareReport.UnchangedRisks, newVuln)
		}
	}

	for hash, oldVuln := range oldVulnMap {
		if _, exists := newVulnMap[hash]; !exists {
			compareReport.RemovedRisks = append(compareReport.RemovedRisks, oldVuln)
		}
	}

	compareReport.DiffSummary = DiffSummary{
		TotalNew:       len(compareReport.NewRisks),
		TotalRemoved:   len(compareReport.RemovedRisks),
		TotalUnchanged: len(compareReport.UnchangedRisks),
	}

	for _, v := range compareReport.NewRisks {
		switch v.Severity {
		case SeverityCritical:
			compareReport.DiffSummary.CriticalNew++
		case SeverityHigh:
			compareReport.DiffSummary.HighNew++
		case SeverityMedium:
			compareReport.DiffSummary.MediumNew++
		}
	}

	for _, v := range compareReport.RemovedRisks {
		switch v.Severity {
		case SeverityCritical:
			compareReport.DiffSummary.CriticalRemoved++
		case SeverityHigh:
			compareReport.DiffSummary.HighRemoved++
		}
	}

	oldCode, _ := os.ReadFile(oldContractPath)
	newCode, _ := os.ReadFile(newContractPath)
	compareReport.CodeDiff = generateLineDiff(string(oldCode), string(newCode))

	return compareReport, nil
}

func (s *Scanner) CompareVersionsFromCode(oldCode, newCode, oldFilename, newFilename string) (*VersionCompareReport, error) {
	tempDir := filepath.Join(s.config.UploadDir, fmt.Sprintf("compare-%d", time.Now().UnixNano()))
	if err := os.MkdirAll(tempDir, 0755); err != nil {
		return nil, err
	}
	defer os.RemoveAll(tempDir)

	if oldFilename == "" {
		oldFilename = "old_contract.sol"
	}
	if newFilename == "" {
		newFilename = "new_contract.sol"
	}

	oldPath := filepath.Join(tempDir, oldFilename)
	newPath := filepath.Join(tempDir, newFilename)

	if err := os.WriteFile(oldPath, []byte(oldCode), 0644); err != nil {
		return nil, err
	}

	if err := os.WriteFile(newPath, []byte(newCode), 0644); err != nil {
		return nil, err
	}

	return s.CompareVersions(oldPath, newPath)
}

func (s *Scanner) generateSummary(vulns []Vulnerability) ScanSummary {
	summary := ScanSummary{Total: len(vulns)}
	for _, v := range vulns {
		switch v.Severity {
		case SeverityCritical:
			summary.Critical++
		case SeverityHigh:
			summary.High++
		case SeverityMedium:
			summary.Medium++
		case SeverityLow:
			summary.Low++
		case SeverityInfo:
			summary.Info++
		}
	}
	return summary
}

func mapImpactToSeverity(impact string) VulnerabilitySeverity {
	switch strings.ToLower(impact) {
	case "critical":
		return SeverityCritical
	case "high":
		return SeverityHigh
	case "medium":
		return SeverityMedium
	case "low":
		return SeverityLow
	default:
		return SeverityInfo
	}
}

func getNestedValue(m map[string]interface{}, key string) interface{} {
	keys := strings.Split(key, ".")
	var current interface{} = m

	for _, k := range keys {
		if cm, ok := current.(map[string]interface{}); ok {
			current = cm[k]
		} else if arr, ok := current.([]interface{}); ok {
			idx := 0
			if k == "-1" && len(arr) > 0 {
				idx = len(arr) - 1
			}
			if idx >= 0 && idx < len(arr) {
				current = arr[idx]
			} else {
				return nil
			}
		} else {
			return nil
		}
	}

	return current
}

func getStringSafe(m map[string]interface{}, key string) string {
	val := getNestedValue(m, key)
	if str, ok := val.(string); ok {
		return str
	}
	return ""
}

func getIntSafe(m map[string]interface{}, key string) int {
	val := getNestedValue(m, key)
	if f, ok := val.(float64); ok {
		return int(f)
	}
	return 0
}

func generateVulnHash(check, description, impact string) string {
	data := fmt.Sprintf("%s|%s|%s", check, truncateString(description, 200), impact)
	hash := sha256.Sum256([]byte(data))
	return fmt.Sprintf("%x", hash[:16])
}

func truncateString(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}

func generateLineDiff(oldCode, newCode string) []CodeDiffLine {
	oldLines := strings.Split(strings.ReplaceAll(oldCode, "\r\n", "\n"), "\n")
	newLines := strings.Split(strings.ReplaceAll(newCode, "\r\n", "\n"), "\n")

	lcs := longestCommonSubstring(oldLines, newLines)

	var diff []CodeDiffLine
	i, j := 0, 0
	lineNum := 1

	for _, common := range lcs {
		for i < len(oldLines) && oldLines[i] != common {
			diff = append(diff, CodeDiffLine{
				LineNumber: lineNum,
				Content:    oldLines[i],
				Status:     "removed",
			})
			i++
		}

		for j < len(newLines) && newLines[j] != common {
			diff = append(diff, CodeDiffLine{
				LineNumber: lineNum,
				Content:    newLines[j],
				Status:     "added",
			})
			lineNum++
			j++
		}

		if i < len(oldLines) && j < len(newLines) && oldLines[i] == newLines[j] {
			diff = append(diff, CodeDiffLine{
				LineNumber: lineNum,
				Content:    oldLines[i],
				Status:     "unchanged",
			})
			lineNum++
			i++
			j++
		}
	}

	for i < len(oldLines) {
		diff = append(diff, CodeDiffLine{
			LineNumber: lineNum,
			Content:    oldLines[i],
			Status:     "removed",
		})
		i++
	}

	for j < len(newLines) {
		diff = append(diff, CodeDiffLine{
			LineNumber: lineNum,
			Content:    newLines[j],
			Status:     "added",
		})
		lineNum++
		j++
	}

	return diff
}

func longestCommonSubstring(a, b []string) []string {
	matrix := make([][]int, len(a)+1)
	for i := range matrix {
		matrix[i] = make([]int, len(b)+1)
	}

	maxLen := 0
	endIdx := 0

	for i := 1; i <= len(a); i++ {
		for j := 1; j <= len(b); j++ {
			if a[i-1] == b[j-1] {
				matrix[i][j] = matrix[i-1][j-1] + 1
				if matrix[i][j] > maxLen {
					maxLen = matrix[i][j]
					endIdx = i
				}
			}
		}
	}

	if maxLen == 0 {
		return []string{}
	}

	return a[endIdx-maxLen : endIdx]
}

func getFixSuggestion(checkType string) string {
	suggestions := map[string]string{
		"reentrancy":            "Use Checks-Effects-Interactions pattern. Consider using ReentrancyGuard from OpenZeppelin.",
		"unchecked-low-level":   "Check return values of low-level calls (call, delegatecall, send). Use require(success, \"Call failed\").",
		"suicidal":              "Remove selfdestruct/suicide calls or implement proper access control with multi-sig.",
		"locked-ether":          "Implement a withdrawal function for users to retrieve their funds.",
		"arbitrary-send":        "Restrict recipient addresses or implement withdrawal pattern instead of direct transfers.",
		"tx-origin":             "Replace tx.origin with msg.sender for authentication.",
		"assembly":              "Avoid inline assembly unless absolutely necessary. If used, add thorough documentation and audits.",
		"timestamp":             "Use block numbers instead of block.timestamp for time-dependent logic. Avoid using timestamp for randomness.",
		"weak-randomness":       "Use commit-reveal scheme or external oracle like Chainlink VRF for secure randomness.",
		"deprecated-standards":  "Upgrade to latest Solidity version. Replace deprecated functions (e.g., blockhash -> block.hash).",
		"missing-zero-check":    "Add zero-address validation checks for address parameters.",
		"incorrect-equality":    "Use >= or <= instead of strict equality for balance comparisons.",
		"divide-before-multiply":"Multiply before dividing to prevent precision loss: (a * b) / c instead of (a / c) * b.",
		"uninitialized-state":   "Initialize all state variables explicitly. Check for uninitialized storage pointers.",
		"reentrancy-eth":        "Use ReentrancyGuard and follow Checks-Effects-Interactions pattern strictly.",
		"erc20-interface":       "Follow EIP-20 standard properly. Implement all required functions and events.",
		"naming-convention":     "Follow Solidity naming conventions: contract names in PascalCase, functions/events in mixedCase.",
	}

	for key, suggestion := range suggestions {
		if strings.Contains(strings.ToLower(checkType), key) {
			return suggestion
		}
	}

	return "Review the code pattern. Follow best practices from OpenZeppelin and Solidity documentation."
}
