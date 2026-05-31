use crate::config::Config;
use crate::models::{
    AffectedPackage, CiCdConfig, ComparisonResult, Dependency, HistoricalScan,
    MatchedVulnerability, ScanResult, ScanSummary, Severity, UpgradeSuggestion, Vulnerability,
    VulnerabilitySource,
};
use crate::parsers::get_all_parsers;
use chrono::Utc;
use reqwest::blocking::Client;
use semver::{Version, VersionReq};
use std::collections::{HashMap, HashSet};
use walkdir::WalkDir;

pub struct Scanner {
    config: Config,
    client: Client,
}

impl Scanner {
    pub fn new(config: Config) -> Self {
        Self {
            config,
            client: Client::new(),
        }
    }

    pub fn scan(&self) -> Result<ScanResult, Box<dyn std::error::Error>> {
        let dependencies = self.collect_dependencies()?;
        let vulnerabilities = self.fetch_vulnerabilities(&dependencies)?;
        let matched = self.match_vulnerabilities(&dependencies, &vulnerabilities);

        let filtered_matched = self.filter_ignored(&matched);
        let summary = self.calculate_summary(&filtered_matched);
        
        let upgrade_suggestions = if self.config.suggest_upgrades {
            self.generate_upgrade_suggestions(&filtered_matched)
        } else {
            Vec::new()
        };

        Ok(ScanResult {
            dependencies,
            vulnerabilities: filtered_matched.clone(),
            scan_time: Utc::now().to_rfc3339(),
            total_dependencies: dependencies.len(),
            total_vulnerabilities: filtered_matched.len(),
            upgrade_suggestions,
            summary,
        })
    }

    pub fn check_cicd(&self, result: &ScanResult) -> Result<bool, Box<dyn std::error::Error>> {
        let config = &self.config.ci_cd;
        
        if config.fail_on_any && result.total_vulnerabilities > 0 {
            return Ok(false);
        }

        if config.fail_on_critical && result.summary.critical_count > 0 {
            return Ok(false);
        }

        if config.fail_on_high && (result.summary.high_count > 0 || result.summary.critical_count > 0) {
            return Ok(false);
        }

        if config.fail_on_medium 
            && (result.summary.medium_count > 0 || result.summary.high_count > 0 || result.summary.critical_count > 0) {
            return Ok(false);
        }

        if let Some(threshold) = config.threshold_count {
            if result.total_vulnerabilities > threshold {
                return Ok(false);
            }
        }

        Ok(true)
    }

    pub fn compare_with_history(
        &self,
        current_result: &ScanResult,
        history_path: &std::path::Path,
    ) -> Result<ComparisonResult, Box<dyn std::error::Error>> {
        let content = std::fs::read_to_string(history_path)?;
        let historical_scan: HistoricalScan = serde_json::from_str(&content)?;

        let current_ids: HashSet<String> = current_result
            .vulnerabilities
            .iter()
            .map(|v| v.vulnerability.id.clone())
            .collect();

        let historical_ids: HashSet<String> = historical_scan.vulnerabilities.into_iter().collect();

        let new_vulnerabilities: Vec<_> = current_result
            .vulnerabilities
            .iter()
            .filter(|v| !historical_ids.contains(&v.vulnerability.id))
            .cloned()
            .collect();

        let fixed_vulnerabilities: Vec<_> = historical_ids
            .difference(&current_ids)
            .cloned()
            .collect();

        let existing_vulnerabilities: Vec<_> = current_result
            .vulnerabilities
            .iter()
            .filter(|v| historical_ids.contains(&v.vulnerability.id))
            .cloned()
            .collect();

        Ok(ComparisonResult {
            total_new: new_vulnerabilities.len(),
            total_fixed: fixed_vulnerabilities.len(),
            total_existing: existing_vulnerabilities.len(),
            new_vulnerabilities,
            fixed_vulnerabilities,
            existing_vulnerabilities,
        })
    }

    pub fn save_history(
        &self,
        result: &ScanResult,
        output_path: &std::path::Path,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let historical_scan = HistoricalScan {
            scan_id: uuid::Uuid::new_v4().to_string(),
            scan_time: result.scan_time.clone(),
            vulnerabilities: result
                .vulnerabilities
                .iter()
                .map(|v| v.vulnerability.id.clone())
                .collect(),
            total_vulnerabilities: result.total_vulnerabilities,
            summary: result.summary.clone(),
        };

        let json = serde_json::to_string_pretty(&historical_scan)?;
        std::fs::write(output_path, json)?;

        Ok(())
    }

    fn generate_upgrade_suggestions(
        &self,
        vulnerabilities: &[MatchedVulnerability],
    ) -> Vec<UpgradeSuggestion> {
        let mut package_vulns: HashMap<String, Vec<MatchedVulnerability>> = HashMap::new();

        for vuln in vulnerabilities {
            package_vulns
                .entry(vuln.dependency.name.clone())
                .or_default()
                .push(vuln.clone());
        }

        let mut suggestions = Vec::new();

        for (package_name, vulns) in package_vulns {
            if vulns.is_empty() {
                continue;
            }

            let current_version = vulns[0].dependency.version.clone();
            let mut max_severity = Severity::Low;
            let mut fixed_versions: Vec<String> = Vec::new();

            for vuln in &vulns {
                if vuln.vulnerability.severity > max_severity {
                    max_severity = vuln.vulnerability.severity;
                }
                fixed_versions.extend(vuln.vulnerability.fixed_versions.clone());
            }

            fixed_versions.sort();
            fixed_versions.dedup();

            let recommended_version = if fixed_versions.is_empty() {
                self.suggest_next_version(&current_version)
            } else {
                fixed_versions.last().cloned().unwrap_or_default()
            };

            let fixed_vuln_ids = vulns
                .iter()
                .map(|v| v.vulnerability.id.clone())
                .collect();

            suggestions.push(UpgradeSuggestion {
                package_name,
                current_version,
                recommended_version,
                fixed_vulnerabilities: fixed_vuln_ids,
                severity_impact: max_severity,
            });
        }

        suggestions
    }

    fn suggest_next_version(&self, version: &str) -> String {
        if let Ok(mut ver) = Version::parse(version) {
            ver.patch += 1;
            ver.to_string()
        } else {
            "latest".to_string()
        }
    }

    fn calculate_summary(&self, vulnerabilities: &[MatchedVulnerability]) -> ScanSummary {
        let mut summary = ScanSummary {
            critical_count: 0,
            high_count: 0,
            medium_count: 0,
            low_count: 0,
            unknown_count: 0,
        };

        for vuln in vulnerabilities {
            match vuln.vulnerability.severity {
                Severity::Critical => summary.critical_count += 1,
                Severity::High => summary.high_count += 1,
                Severity::Medium => summary.medium_count += 1,
                Severity::Low => summary.low_count += 1,
                Severity::Unknown => summary.unknown_count += 1,
            }
        }

        summary
    }

    fn collect_dependencies(&self) -> Result<Vec<Dependency>, Box<dyn std::error::Error>> {
        let mut all_deps = Vec::new();
        let parsers = get_all_parsers();

        for entry in WalkDir::new(&self.config.path)
            .max_depth(self.config.depth as usize)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let path = entry.path();
            if path.is_file() {
                for parser in &parsers {
                    if parser.can_parse(path) {
                        match parser.parse(path) {
                            Ok(mut deps) => all_deps.append(&mut deps),
                            Err(e) => eprintln!("Warning: Failed to parse {}: {}", path.display(), e),
                        }
                    }
                }
            }
        }

        Ok(all_deps)
    }

    fn fetch_vulnerabilities(
        &self,
        dependencies: &[Dependency],
    ) -> Result<Vec<Vulnerability>, Box<dyn std::error::Error>> {
        let mut vulnerabilities = Vec::new();

        if self.config.use_osv {
            match self.fetch_osv_vulnerabilities(dependencies) {
                Ok(mut osv_vulns) => vulnerabilities.append(&mut osv_vulns),
                Err(e) => eprintln!("Warning: OSV fetch failed: {}", e),
            }
        }

        if self.config.use_nvd {
            match self.fetch_nvd_vulnerabilities(dependencies) {
                Ok(mut nvd_vulns) => vulnerabilities.append(&mut nvd_vulns),
                Err(e) => eprintln!("Warning: NVD fetch failed: {}", e),
            }
        }

        Ok(vulnerabilities)
    }

    fn fetch_osv_vulnerabilities(
        &self,
        dependencies: &[Dependency],
    ) -> Result<Vec<Vulnerability>, Box<dyn std::error::Error>> {
        let mut vulnerabilities = Vec::new();
        let osv_url = "https://api.osv.dev/v1/query";

        for dep in dependencies {
            if dep.version == "unknown" {
                continue;
            }

            let ecosystem = match dep.manager {
                crate::models::PackageManager::Npm => "npm",
                crate::models::PackageManager::Pip => "PyPI",
                crate::models::PackageManager::Maven => "Maven",
                crate::models::PackageManager::GoMod => "Go",
            };

            let request = serde_json::json!({
                "package": {
                    "name": dep.name,
                    "ecosystem": ecosystem
                },
                "version": dep.version
            });

            let response = self.client.post(osv_url).json(&request).send()?;
            if response.status().is_success() {
                let result: serde_json::Value = response.json()?;
                if let Some(vulns) = result["vulns"].as_array() {
                    for vuln in vulns {
                        let id = vuln["id"].as_str().unwrap_or("UNKNOWN").to_string();
                        let summary = vuln["summary"].as_str().unwrap_or("").to_string();
                        let description = vuln["details"].as_str().unwrap_or("").to_string();

                        let severity = if let Some(severities) = vuln["severity"].as_array() {
                            severities
                                .iter()
                                .find(|s| s["type"] == "CVSS_V3")
                                .and_then(|s| s["score"].as_str())
                                .map(|s| parse_cvss_severity(s))
                                .unwrap_or(Severity::Unknown)
                        } else {
                            Severity::Unknown
                        };

                        let mut affected_packages = Vec::new();
                        let mut fixed_versions = Vec::new();

                        if let Some(affected) = vuln["affected"].as_array() {
                            for aff in affected {
                                if let Some(pkg) = aff["package"].as_object() {
                                    let name = pkg["name"].as_str().unwrap_or("").to_string();
                                    let ecosystem = pkg["ecosystem"].as_str().unwrap_or("").to_string();

                                    let ranges = aff["ranges"]
                                        .as_array()
                                        .and_then(|r| r.first())
                                        .and_then(|r| r["events"].as_array())
                                        .unwrap_or(&vec![]);

                                    let mut version_range = String::new();
                                    for event in ranges {
                                        if let Some(introduced) = event["introduced"].as_str() {
                                            if introduced != "0" {
                                                version_range.push_str(&format!(">={}", introduced));
                                            }
                                        }
                                        if let Some(fixed) = event["fixed"].as_str() {
                                            fixed_versions.push(fixed.to_string());
                                            if !version_range.is_empty() {
                                                version_range.push_str(", ");
                                            }
                                            version_range.push_str(&format!("<{}", fixed));
                                        }
                                    }

                                    affected_packages.push(AffectedPackage {
                                        name,
                                        ecosystem,
                                        vulnerable_version_range: version_range,
                                    });
                                }
                            }
                        }

                        let mut references = Vec::new();
                        if let Some(refs) = vuln["references"].as_array() {
                            for r in refs {
                                if let Some(url) = r["url"].as_str() {
                                    references.push(url.to_string());
                                }
                            }
                        }

                        vulnerabilities.push(Vulnerability {
                            id,
                            summary,
                            description,
                            severity,
                            affected_packages,
                            references,
                            source: VulnerabilitySource::OSV,
                            fixed_versions,
                        });
                    }
                }
            }
        }

        Ok(vulnerabilities)
    }

    fn fetch_nvd_vulnerabilities(
        &self,
        dependencies: &[Dependency],
    ) -> Result<Vec<Vulnerability>, Box<dyn std::error::Error>> {
        let mut vulnerabilities = Vec::new();
        let nvd_url = "https://services.nvd.nist.gov/rest/json/cves/2.0";

        for dep in dependencies {
            let keyword = dep.name.replace(':', " ");
            let url = format!("{}?keywordSearch={}", nvd_url, keyword);

            let response = self.client.get(&url).send()?;
            if response.status().is_success() {
                let result: serde_json::Value = response.json()?;
                if let Some(vulns) = result["vulnerabilities"].as_array() {
                    for vuln in vulns {
                        let cve = &vuln["cve"];
                        let id = cve["id"].as_str().unwrap_or("UNKNOWN").to_string();
                        let summary = cve["descriptions"]
                            .as_array()
                            .and_then(|d| d.first())
                            .and_then(|d| d["value"].as_str())
                            .unwrap_or("")
                            .to_string();

                        let severity = cve["metrics"]["cvssMetricV31"]
                            .as_array()
                            .and_then(|m| m.first())
                            .and_then(|m| m["cvssData"]["baseSeverity"].as_str())
                            .map(|s| match s {
                                "CRITICAL" => Severity::Critical,
                                "HIGH" => Severity::High,
                                "MEDIUM" => Severity::Medium,
                                "LOW" => Severity::Low,
                                _ => Severity::Unknown,
                            })
                            .unwrap_or(Severity::Unknown);

                        let mut references = Vec::new();
                        if let Some(refs) = cve["references"].as_array() {
                            for r in refs {
                                if let Some(url) = r["url"].as_str() {
                                    references.push(url.to_string());
                                }
                            }
                        }

                        let version_range = extract_version_range_from_cve(&summary, &dep.name);
                        let fixed_versions = extract_fixed_versions_from_cve(&summary);

                        vulnerabilities.push(Vulnerability {
                            id,
                            summary: summary.clone(),
                            description: summary,
                            severity,
                            affected_packages: vec![AffectedPackage {
                                name: dep.name.clone(),
                                ecosystem: dep.manager.to_str().to_string(),
                                vulnerable_version_range: version_range,
                            }],
                            references,
                            source: VulnerabilitySource::NVD,
                            fixed_versions,
                        });
                    }
                }
            }
        }

        Ok(vulnerabilities)
    }

    fn match_vulnerabilities(
        &self,
        dependencies: &[Dependency],
        vulnerabilities: &[Vulnerability],
    ) -> Vec<MatchedVulnerability> {
        let mut matched = Vec::new();
        let mut seen = std::collections::HashSet::new();

        for dep in dependencies {
            for vuln in vulnerabilities {
                for affected in &vuln.affected_packages {
                    if self.package_matches(dep, affected) {
                        if self.version_matches(&dep.version, &affected.vulnerable_version_range) {
                            let key = format!("{}:{}", dep.name, vuln.id);
                            if !seen.contains(&key) {
                                seen.insert(key);
                                matched.push(MatchedVulnerability {
                                    dependency: dep.clone(),
                                    vulnerability: vuln.clone(),
                                });
                            }
                        }
                    }
                }
            }
        }

        matched
    }

    fn package_matches(&self, dep: &Dependency, affected: &AffectedPackage) -> bool {
        let dep_eco = dep.manager.to_str().to_lowercase();
        let aff_eco = affected.ecosystem.to_lowercase();

        if dep_eco != aff_eco && !aff_eco.is_empty() {
            return false;
        }

        let dep_name = normalize_package_name(&dep.name);
        let aff_name = normalize_package_name(&affected.name);

        if dep_name == aff_name {
            return true;
        }

        let dep_parts: Vec<&str> = dep_name.split(&[':', '/', '-'][..]).collect();
        let aff_parts: Vec<&str> = aff_name.split(&[':', '/', '-'][..]).collect();

        if dep_parts.len() >= 2 && aff_parts.len() >= 2 {
            return dep_parts.last() == aff_parts.last();
        }

        false
    }

    fn version_matches(&self, version: &str, range: &str) -> bool {
        if range == "*" || range.is_empty() {
            return true;
        }

        if range == "unknown" {
            return false;
        }

        if version == "unknown" {
            return false;
        }

        let clean_version = clean_version_string(version);
        
        let ver = match Version::parse(&clean_version) {
            Ok(v) => v,
            Err(_) => return false,
        };

        let ranges = parse_version_ranges(range);
        if ranges.is_empty() {
            return false;
        }

        for (op, ver_str) in ranges {
            let clean_ver_str = clean_version_string(&ver_str);
            let range_ver = match Version::parse(&clean_ver_str) {
                Ok(v) => v,
                Err(_) => continue,
            };

            let matches = match op.as_str() {
                ">=" => ver >= range_ver,
                ">" => ver > range_ver,
                "<=" => ver <= range_ver,
                "<" => ver < range_ver,
                "==" => ver == range_ver,
                _ => continue,
            };

            if !matches {
                return false;
            }
        }

        true
    }

    fn filter_ignored(&self, matched: &[MatchedVulnerability]) -> Vec<MatchedVulnerability> {
        let ignored: HashSet<String> = self.config.ignore.iter().cloned().collect();
        matched
            .iter()
            .filter(|m| !ignored.contains(&m.vulnerability.id))
            .cloned()
            .collect()
    }
}

fn parse_cvss_severity(score: &str) -> Severity {
    if let Ok(score) = score.parse::<f64>() {
        match score {
            9.0..=10.0 => Severity::Critical,
            7.0..=8.9 => Severity::High,
            4.0..=6.9 => Severity::Medium,
            0.1..=3.9 => Severity::Low,
            _ => Severity::Unknown,
        }
    } else {
        Severity::Unknown
    }
}

fn normalize_package_name(name: &str) -> String {
    name.to_lowercase()
        .replace(|c: char| !c.is_alphanumeric() && c != '-' && c != '_' && c != ':' && c != '/', "")
}

fn clean_version_string(version: &str) -> String {
    let mut clean = version.trim_start_matches(|c: char| !c.is_numeric());
    
    let mut parts = Vec::new();
    for part in clean.split(&['.', '-', '+'][..]) {
        if part.chars().all(|c| c.is_numeric()) {
            parts.push(part);
        } else {
            break;
        }
    }
    
    if parts.is_empty() {
        return version.to_string();
    }
    
    while parts.len() < 3 {
        parts.push("0");
    }
    
    parts.join(".")
}

fn parse_version_ranges(range: &str) -> Vec<(String, String)> {
    let mut ranges = Vec::new();
    
    for part in range.split(&[',', ' ', ';'][..]) {
        let part = part.trim();
        if part.is_empty() {
            continue;
        }
        
        let operators = &[">=", "<=", "!=", ">", "<", "=="];
        for &op in operators {
            if part.starts_with(op) {
                let ver = part[op.len()..].trim();
                if !ver.is_empty() {
                    ranges.push((op.to_string(), ver.to_string()));
                    break;
                }
            }
        }
    }
    
    ranges
}

fn extract_version_range_from_cve(description: &str, package_name: &str) -> String {
    let lower_desc = description.to_lowercase();
    
    let version_pattern = match regex::Regex::new(r"\d+\.\d+(?:\.\d+)*") {
        Ok(p) => p,
        Err(_) => return "unknown".to_string(),
    };
    
    let versions: Vec<String> = version_pattern.find_iter(&lower_desc)
        .map(|m| m.as_str().to_string())
        .collect();
    
    if versions.is_empty() {
        return "unknown".to_string();
    }
    
    let mut ranges = Vec::new();
    
    if lower_desc.contains("before") || lower_desc.contains("prior to") || lower_desc.contains("<") {
        if let Some(ver) = versions.first() {
            ranges.push(format!("<{}", ver));
        }
    }
    
    if lower_desc.contains("after") || lower_desc.contains(">=") || lower_desc.contains("and") {
        if versions.len() >= 2 {
            ranges.push(format!(">={}", versions[0]));
            ranges.push(format!("<{}", versions[1]));
        } else if let Some(ver) = versions.first() {
            if lower_desc.contains("and") {
                ranges.push(format!(">={}", ver));
            }
        }
    }
    
    if ranges.is_empty() {
        if let Some(ver) = versions.first() {
            ranges.push(format!("<={}", ver));
        }
    }
    
    ranges.join(", ")
}

fn extract_fixed_versions_from_cve(description: &str) -> Vec<String> {
    let lower_desc = description.to_lowercase();
    
    let version_pattern = match regex::Regex::new(r"\d+\.\d+(?:\.\d+)*") {
        Ok(p) => p,
        Err(_) => return Vec::new(),
    };
    
    let versions: Vec<String> = version_pattern.find_iter(&lower_desc)
        .map(|m| m.as_str().to_string())
        .collect();
    
    if versions.len() >= 2 {
        versions[1..].to_vec()
    } else {
        Vec::new()
    }
}
