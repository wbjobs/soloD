use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Dependency {
    pub name: String,
    pub version: String,
    pub manager: PackageManager,
    pub path: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum PackageManager {
    Npm,
    Pip,
    Maven,
    GoMod,
}

impl PackageManager {
    pub fn to_str(&self) -> &'static str {
        match self {
            PackageManager::Npm => "npm",
            PackageManager::Pip => "pip",
            PackageManager::Maven => "maven",
            PackageManager::GoMod => "go",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Vulnerability {
    pub id: String,
    pub summary: String,
    pub description: String,
    pub severity: Severity,
    pub affected_packages: Vec<AffectedPackage>,
    pub references: Vec<String>,
    pub source: VulnerabilitySource,
    pub fixed_versions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AffectedPackage {
    pub name: String,
    pub ecosystem: String,
    pub vulnerable_version_range: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
pub enum Severity {
    Critical,
    High,
    Medium,
    Low,
    Unknown,
}

impl Severity {
    pub fn to_str(&self) -> &'static str {
        match self {
            Severity::Critical => "CRITICAL",
            Severity::High => "HIGH",
            Severity::Medium => "MEDIUM",
            Severity::Low => "LOW",
            Severity::Unknown => "UNKNOWN",
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum VulnerabilitySource {
    NVD,
    OSV,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResult {
    pub dependencies: Vec<Dependency>,
    pub vulnerabilities: Vec<MatchedVulnerability>,
    pub scan_time: String,
    pub total_dependencies: usize,
    pub total_vulnerabilities: usize,
    pub upgrade_suggestions: Vec<UpgradeSuggestion>,
    pub summary: ScanSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchedVulnerability {
    pub dependency: Dependency,
    pub vulnerability: Vulnerability,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpgradeSuggestion {
    pub package_name: String,
    pub current_version: String,
    pub recommended_version: String,
    pub fixed_vulnerabilities: Vec<String>,
    pub severity_impact: Severity,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanSummary {
    pub critical_count: usize,
    pub high_count: usize,
    pub medium_count: usize,
    pub low_count: usize,
    pub unknown_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CiCdConfig {
    pub fail_on_critical: bool,
    pub fail_on_high: bool,
    pub fail_on_medium: bool,
    pub fail_on_any: bool,
    pub threshold_count: Option<usize>,
}

impl Default for CiCdConfig {
    fn default() -> Self {
        Self {
            fail_on_critical: true,
            fail_on_high: false,
            fail_on_medium: false,
            fail_on_any: false,
            threshold_count: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoricalScan {
    pub scan_id: String,
    pub scan_time: String,
    pub vulnerabilities: Vec<String>,
    pub total_vulnerabilities: usize,
    pub summary: ScanSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComparisonResult {
    pub new_vulnerabilities: Vec<MatchedVulnerability>,
    pub fixed_vulnerabilities: Vec<String>,
    pub existing_vulnerabilities: Vec<MatchedVulnerability>,
    pub total_new: usize,
    pub total_fixed: usize,
    pub total_existing: usize,
}
