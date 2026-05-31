use crate::cli::{OutputFormat};
use crate::config::Config;
use crate::models::{ComparisonResult, ScanResult, Severity, VulnerabilitySource};

pub struct Reporter {
    config: Config,
}

impl Reporter {
    pub fn new(config: Config) -> Self {
        Self { config }
    }

    pub fn report(&self, result: &ScanResult) -> Result<(), Box<dyn std::error::Error>> {
        let output = match self.config.format {
            OutputFormat::Text => self.generate_text_report(result),
            OutputFormat::Json => self.generate_json_report(result)?,
            OutputFormat::Html => self.generate_html_report(result),
        };

        if let Some(output_path) = &self.config.output {
            std::fs::write(output_path, output)?;
            println!("Report written to: {}", output_path.display());
        } else {
            println!("{}", output);
        }

        Ok(())
    }

    pub fn report_comparison(&self, comparison: &ComparisonResult) -> Result<(), Box<dyn std::error::Error>> {
        let output = match self.config.format {
            OutputFormat::Text => self.generate_comparison_text(comparison),
            OutputFormat::Json => serde_json::to_string_pretty(comparison)?,
            OutputFormat::Html => self.generate_comparison_html(comparison),
        };

        println!("{}", output);
        Ok(())
    }

    fn generate_text_report(&self, result: &ScanResult) -> String {
        let mut output = String::new();

        output.push_str("Dependency Security Scan Report\n");
        output.push_str("================================\n\n");
        output.push_str(&format!("Scan Time: {}\n", result.scan_time));
        output.push_str(&format!("Total Dependencies Scanned: {}\n", result.total_dependencies));
        output.push_str(&format!("Vulnerabilities Found: {}\n\n", result.total_vulnerabilities));

        output.push_str("Severity Summary:\n");
        output.push_str(&format!("  CRITICAL: {}\n", result.summary.critical_count));
        output.push_str(&format!("  HIGH: {}\n", result.summary.high_count));
        output.push_str(&format!("  MEDIUM: {}\n", result.summary.medium_count));
        output.push_str(&format!("  LOW: {}\n", result.summary.low_count));
        output.push_str(&format!("  UNKNOWN: {}\n\n", result.summary.unknown_count));

        if result.vulnerabilities.is_empty() {
            output.push_str("No vulnerabilities found! 🎉\n");
        } else {
            output.push_str("Detailed Vulnerabilities:\n");
            output.push_str(&format!("{:-<100}\n", ""));

            for (i, v) in result.vulnerabilities.iter().enumerate() {
                output.push_str(&format!("\n{}. [{}] {} ({})\n",
                    i + 1,
                    v.vulnerability.severity.to_str(),
                    v.vulnerability.id,
                    match v.vulnerability.source {
                        VulnerabilitySource::OSV => "OSV",
                        VulnerabilitySource::NVD => "NVD",
                    }
                ));
                output.push_str(&format!("   Package: {} @ {} ({})\n",
                    v.dependency.name,
                    v.dependency.version,
                    v.dependency.manager.to_str()
                ));
                output.push_str(&format!("   File: {}\n", v.dependency.path));
                output.push_str(&format!("   Summary: {}\n", v.vulnerability.summary));

                if !v.vulnerability.references.is_empty() {
                    output.push_str(&format!("   References:\n"));
                    for r in &v.vulnerability.references {
                        output.push_str(&format!("     - {}\n", r));
                    }
                }
            }
        }

        if !result.upgrade_suggestions.is_empty() {
            output.push_str("\n\nUpgrade Suggestions:\n");
            output.push_str(&format!("{:-<100}\n", ""));
            
            for suggestion in &result.upgrade_suggestions {
                output.push_str(&format!("\nPackage: {}\n", suggestion.package_name));
                output.push_str(&format!("  Current Version: {}\n", suggestion.current_version));
                output.push_str(&format!("  Recommended Version: {}\n", suggestion.recommended_version));
                output.push_str(&format!("  Severity Impact: [{}]\n", suggestion.severity_impact.to_str()));
                output.push_str(&format!("  Fixes Vulnerabilities: {}\n", suggestion.fixed_vulnerabilities.join(", ")));
            }
        }

        output
    }

    fn generate_json_report(&self, result: &ScanResult) -> Result<String, Box<dyn std::error::Error>> {
        Ok(serde_json::to_string_pretty(result)?)
    }

    fn generate_html_report(&self, result: &ScanResult) -> String {
        let mut vuln_rows = String::new();

        for v in &result.vulnerabilities {
            let severity_color = match v.vulnerability.severity {
                Severity::Critical => "#dc3545",
                Severity::High => "#fd7e14",
                Severity::Medium => "#ffc107",
                Severity::Low => "#20c997",
                Severity::Unknown => "#6c757d",
            };

            let references = v.vulnerability.references
                .iter()
                .map(|r| format!("<a href=\"{}\" target=\"_blank\">{}</a>", r, if r.len() > 50 { &r[0..50] } else { r }))
                .collect::<Vec<_>>()
                .join("<br>");

            vuln_rows.push_str(&format!(
                r#"
                <tr>
                    <td><span class="badge" style="background-color: {}">{}</span></td>
                    <td><strong>{}</strong></td>
                    <td>{}<br><small>{}</small></td>
                    <td>{}</td>
                    <td>{}</td>
                    <td>{}</td>
                </tr>
                "#,
                severity_color,
                v.vulnerability.severity.to_str(),
                v.vulnerability.id,
                v.dependency.name,
                v.dependency.version,
                v.dependency.manager.to_str(),
                v.vulnerability.summary,
                references
            ));
        }

        let mut upgrade_rows = String::new();
        for suggestion in &result.upgrade_suggestions {
            let severity_color = match suggestion.severity_impact {
                Severity::Critical => "#dc3545",
                Severity::High => "#fd7e14",
                Severity::Medium => "#ffc107",
                Severity::Low => "#20c997",
                Severity::Unknown => "#6c757d",
            };

            upgrade_rows.push_str(&format!(
                r#"
                <tr>
                    <td><strong>{}</strong></td>
                    <td>{}</td>
                    <td><strong>{}</strong></td>
                    <td><span class="badge" style="background-color: {}">{}</span></td>
                    <td>{}</td>
                </tr>
                "#,
                suggestion.package_name,
                suggestion.current_version,
                suggestion.recommended_version,
                severity_color,
                suggestion.severity_impact.to_str(),
                suggestion.fixed_vulnerabilities.join(", ")
            ));
        }

        format!(
            r#"
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dependency Security Scan Report</title>
    <style>
        body {{ font-family: Arial, sans-serif; margin: 20px; background-color: #f8f9fa; }}
        .container {{ max-width: 1200px; margin: 0 auto; }}
        .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px; margin-bottom: 30px; }}
        .stats {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }}
        .stat-card {{ background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; }}
        .stat-value {{ font-size: 36px; font-weight: bold; }}
        .stat-label {{ color: #6c757d; }}
        .critical {{ color: #dc3545; }}
        .high {{ color: #fd7e14; }}
        .medium {{ color: #ffc107; }}
        .low {{ color: #20c997; }}
        .table-container {{ background: white; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); overflow: hidden; margin-bottom: 30px; }}
        .table {{ width: 100%; border-collapse: collapse; }}
        .table th {{ background: #343a40; color: white; padding: 15px; text-align: left; }}
        .table td {{ padding: 15px; border-bottom: 1px solid #dee2e6; }}
        .table tr:hover {{ background-color: #f8f9fa; }}
        .badge {{ padding: 5px 12px; border-radius: 20px; color: white; font-size: 12px; font-weight: bold; }}
        .empty-state {{ text-align: center; padding: 50px; color: #6c757d; }}
        a {{ color: #667eea; text-decoration: none; }}
        a:hover {{ text-decoration: underline; }}
        h2 {{ color: #343a40; margin-top: 40px; margin-bottom: 20px; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Dependency Security Scan Report</h1>
            <p>Scan Time: {}</p>
        </div>

        <div class="stats">
            <div class="stat-card">
                <div class="stat-value">{}</div>
                <div class="stat-label">Total Dependencies</div>
            </div>
            <div class="stat-card">
                <div class="stat-value critical">{}</div>
                <div class="stat-label">Critical</div>
            </div>
            <div class="stat-card">
                <div class="stat-value high">{}</div>
                <div class="stat-label">High</div>
            </div>
            <div class="stat-card">
                <div class="stat-value medium">{}</div>
                <div class="stat-label">Medium</div>
            </div>
            <div class="stat-card">
                <div class="stat-value low">{}</div>
                <div class="stat-label">Low</div>
            </div>
        </div>

        {}

        {}
    </div>
</body>
</html>
            "#,
            result.scan_time,
            result.total_dependencies,
            result.summary.critical_count,
            result.summary.high_count,
            result.summary.medium_count,
            result.summary.low_count,
            if result.vulnerabilities.is_empty() {
                r#"
                <div class="empty-state">
                    <h2>🎉 No Vulnerabilities Found!</h2>
                    <p>All dependencies are clean. Great job!</p>
                </div>
                "#.to_string()
            } else {
                format!(
                    r#"
                    <h2>Vulnerabilities Found</h2>
                    <div class="table-container">
                        <table class="table">
                            <thead>
                                <tr>
                                    <th>Severity</th>
                                    <th>CVE ID</th>
                                    <th>Package</th>
                                    <th>Manager</th>
                                    <th>Summary</th>
                                    <th>References</th>
                                </tr>
                            </thead>
                            <tbody>
                                {}
                            </tbody>
                        </table>
                    </div>
                    "#,
                    vuln_rows
                )
            },
            if result.upgrade_suggestions.is_empty() {
                String::new()
            } else {
                format!(
                    r#"
                    <h2>Upgrade Suggestions</h2>
                    <div class="table-container">
                        <table class="table">
                            <thead>
                                <tr>
                                    <th>Package</th>
                                    <th>Current Version</th>
                                    <th>Recommended Version</th>
                                    <th>Severity Impact</th>
                                    <th>Fixed Vulnerabilities</th>
                                </tr>
                            </thead>
                            <tbody>
                                {}
                            </tbody>
                        </table>
                    </div>
                    "#,
                    upgrade_rows
                )
            }
        )
    }

    fn generate_comparison_text(&self, comparison: &ComparisonResult) -> String {
        let mut output = String::new();

        output.push_str("Historical Comparison Report\n");
        output.push_str("============================\n\n");
        
        output.push_str(&format!("New Vulnerabilities: {}\n", comparison.total_new));
        output.push_str(&format!("Fixed Vulnerabilities: {}\n", comparison.total_fixed));
        output.push_str(&format!("Existing Vulnerabilities: {}\n\n", comparison.total_existing));

        if !comparison.new_vulnerabilities.is_empty() {
            output.push_str("New Vulnerabilities:\n");
            for v in &comparison.new_vulnerabilities {
                output.push_str(&format!("  - [{}] {}: {} @ {}\n",
                    v.vulnerability.severity.to_str(),
                    v.vulnerability.id,
                    v.dependency.name,
                    v.dependency.version
                ));
            }
            output.push('\n');
        }

        if !comparison.fixed_vulnerabilities.is_empty() {
            output.push_str("Fixed Vulnerabilities:\n");
            for id in &comparison.fixed_vulnerabilities {
                output.push_str(&format!("  ✓ {}\n", id));
            }
            output.push('\n');
        }

        if !comparison.existing_vulnerabilities.is_empty() {
            output.push_str("Existing (Unresolved) Vulnerabilities:\n");
            for v in &comparison.existing_vulnerabilities {
                output.push_str(&format!("  - [{}] {}: {} @ {}\n",
                    v.vulnerability.severity.to_str(),
                    v.vulnerability.id,
                    v.dependency.name,
                    v.dependency.version
                ));
            }
        }

        output
    }

    fn generate_comparison_html(&self, comparison: &ComparisonResult) -> String {
        format!(
            r#"
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Scan Comparison Report</title>
    <style>
        body {{ font-family: Arial, sans-serif; margin: 20px; background-color: #f8f9fa; }}
        .container {{ max-width: 1200px; margin: 0 auto; }}
        .stats {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }}
        .stat-card {{ background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; }}
        .stat-value {{ font-size: 36px; font-weight: bold; }}
        .stat-label {{ color: #6c757d; }}
        .new {{ color: #dc3545; }}
        .fixed {{ color: #20c997; }}
        .existing {{ color: #ffc107; }}
        .section {{ background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-bottom: 20px; }}
        h2 {{ color: #343a40; margin-bottom: 20px; }}
        ul {{ list-style: none; padding: 0; }}
        li {{ padding: 10px; border-bottom: 1px solid #dee2e6; }}
    </style>
</head>
<body>
    <div class="container">
        <h1>Scan Comparison Report</h1>
        
        <div class="stats">
            <div class="stat-card">
                <div class="stat-value new">{}</div>
                <div class="stat-label">New Vulnerabilities</div>
            </div>
            <div class="stat-card">
                <div class="stat-value fixed">{}</div>
                <div class="stat-label">Fixed Vulnerabilities</div>
            </div>
            <div class="stat-card">
                <div class="stat-value existing">{}</div>
                <div class="stat-label">Existing Vulnerabilities</div>
            </div>
        </div>

        <div class="section">
            <h2>New Vulnerabilities</h2>
            {}
        </div>

        <div class="section">
            <h2>Fixed Vulnerabilities</h2>
            {}
        </div>

        <div class="section">
            <h2>Existing Vulnerabilities</h2>
            {}
        </div>
    </div>
</body>
</html>
            "#,
            comparison.total_new,
            comparison.total_fixed,
            comparison.total_existing,
            if comparison.new_vulnerabilities.is_empty() {
                "<p>No new vulnerabilities found.</p>".to_string()
            } else {
                format!(
                    "<ul>{}</ul>",
                    comparison.new_vulnerabilities
                        .iter()
                        .map(|v| format!(
                            "<li><strong>[{}]</strong> {}: {} @ {}</li>",
                            v.vulnerability.severity.to_str(),
                            v.vulnerability.id,
                            v.dependency.name,
                            v.dependency.version
                        ))
                        .collect::<Vec<_>>()
                        .join("")
                )
            },
            if comparison.fixed_vulnerabilities.is_empty() {
                "<p>No vulnerabilities fixed.</p>".to_string()
            } else {
                format!(
                    "<ul>{}</ul>",
                    comparison.fixed_vulnerabilities
                        .iter()
                        .map(|id| format!("<li>✅ {}</li>", id))
                        .collect::<Vec<_>>()
                        .join("")
                )
            },
            if comparison.existing_vulnerabilities.is_empty() {
                "<p>No existing vulnerabilities.</p>".to_string()
            } else {
                format!(
                    "<ul>{}</ul>",
                    comparison.existing_vulnerabilities
                        .iter()
                        .map(|v| format!(
                            "<li><strong>[{}]</strong> {}: {} @ {}</li>",
                            v.vulnerability.severity.to_str(),
                            v.vulnerability.id,
                            v.dependency.name,
                            v.dependency.version
                        ))
                        .collect::<Vec<_>>()
                        .join("")
                )
            }
        )
    }
}
