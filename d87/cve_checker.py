import requests
import json
import config

class CveChecker:
    def __init__(self):
        self.osv_api_url = config.OSV_API_URL
        self.session = requests.Session()

    def check_vulnerability(self, package_name, package_version):
        try:
            payload = {
                "version": package_version,
                "package": {
                    "name": package_name,
                    "ecosystem": "npm"
                }
            }

            response = self.session.post(
                self.osv_api_url,
                json=payload,
                timeout=30
            )
            response.raise_for_status()
            data = response.json()

            vulnerabilities = data.get('vulns', [])
            
            if vulnerabilities:
                return {
                    "has_vulnerability": True,
                    "vulnerabilities": [self._format_vulnerability(v) for v in vulnerabilities]
                }
            
            return {"has_vulnerability": False, "vulnerabilities": []}

        except requests.exceptions.RequestException as e:
            print(f"Error checking vulnerability for {package_name}@{package_version}: {e}")
            return {"has_vulnerability": False, "vulnerabilities": [], "error": str(e)}

    def _format_vulnerability(self, vuln):
        return {
            "id": vuln.get('id', ''),
            "summary": vuln.get('summary', ''),
            "details": vuln.get('details', ''),
            "severity": self._get_severity(vuln),
            "references": [ref.get('url', '') for ref in vuln.get('references', [])],
            "affected_versions": self._get_affected_versions(vuln)
        }

    def _get_severity(self, vuln):
        severity_list = vuln.get('severity', [])
        if severity_list:
            return severity_list[0].get('score', '')
        return ''

    def _get_affected_versions(self, vuln):
        affected = vuln.get('affected', [])
        versions = []
        for aff in affected:
            ranges = aff.get('ranges', [])
            for r in ranges:
                events = r.get('events', [])
                versions.extend([e.get('introduced', '') for e in events if 'introduced' in e])
        return list(set(versions))

    def batch_check_vulnerabilities(self, packages):
        results = {}
        for pkg in packages:
            package_name = pkg.get('name')
            package_version = pkg.get('version')
            if package_name and package_version:
                key = f"{package_name}@{package_version}"
                results[key] = self.check_vulnerability(package_name, package_version)
        return results

cve_checker = CveChecker()
