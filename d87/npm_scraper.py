import requests
import re
from packaging.version import Version, parse as parse_version
from packaging.specifiers import SpecifierSet
import config

class NpmScraper:
    def __init__(self):
        self.base_url = config.NPM_REGISTRY_URL
        self.session = requests.Session()
        self.processed_packages = set()

    def get_package_info(self, package_name, version=None):
        try:
            if version:
                url = f"{self.base_url}/{package_name}/{version}"
            else:
                url = f"{self.base_url}/{package_name}/latest"
            
            response = self.session.get(url, timeout=30)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"Error fetching {package_name}@{version}: {e}")
            return None

    def resolve_version(self, package_name, version_range):
        if version_range in ['latest', '*', '']:
            info = self.get_package_info(package_name)
            return info.get('version') if info else None
        
        if version_range.startswith('^') or version_range.startswith('~'):
            info = self.get_package_info(package_name)
            if not info:
                return None
            versions = list(info.get('versions', {}).keys())
            return self._find_best_version(versions, version_range)
        
        return version_range.replace('^', '').replace('~', '')

    def _find_best_version(self, versions, version_range):
        try:
            specifier = self._parse_specifier(version_range)
            valid_versions = []
            for v in versions:
                try:
                    ver = parse_version(v)
                    if ver in specifier:
                        valid_versions.append((ver, v))
                except:
                    continue
            if valid_versions:
                valid_versions.sort(reverse=True)
                return valid_versions[0][1]
        except:
            pass
        return versions[-1] if versions else None

    def _parse_specifier(self, version_range):
        if version_range.startswith('^'):
            base_version = version_range[1:]
            major = int(base_version.split('.')[0])
            return SpecifierSet(f">={base_version},<{major+1}.0.0")
        elif version_range.startswith('~'):
            base_version = version_range[1:]
            parts = base_version.split('.')
            if len(parts) >= 2:
                minor = int(parts[1])
                return SpecifierSet(f">={base_version},<{parts[0]}.{minor+1}.0")
        return SpecifierSet(version_range)

    def scrape_dependencies(self, package_name, version=None, depth=0, max_depth=5):
        pkg_id = f"{package_name}@{version}"
        if pkg_id in self.processed_packages or depth > max_depth:
            return []

        self.processed_packages.add(pkg_id)
        
        package_info = self.get_package_info(package_name, version)
        if not package_info:
            return []

        actual_version = package_info.get('version')
        dependencies = package_info.get('dependencies', {})
        dev_dependencies = package_info.get('devDependencies', {})
        
        all_dependencies = dict(dependencies)
        all_dependencies.update(dev_dependencies)
        
        results = [{
            'name': package_name,
            'version': actual_version,
            'dependencies': all_dependencies
        }]

        for dep_name, dep_version_range in all_dependencies.items():
            resolved_version = self.resolve_version(dep_name, dep_version_range)
            if resolved_version:
                sub_deps = self.scrape_dependencies(
                    dep_name, 
                    resolved_version, 
                    depth + 1, 
                    max_depth
                )
                results.extend(sub_deps)

        return results

    def reset(self):
        self.processed_packages.clear()

scraper = NpmScraper()
