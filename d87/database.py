from neo4j import GraphDatabase
import config

class Neo4jDatabase:
    def __init__(self):
        self.driver = GraphDatabase.driver(
            config.NEO4J_URI,
            auth=(config.NEO4J_USER, config.NEO4J_PASSWORD)
        )

    def close(self):
        self.driver.close()

    def clear_database(self):
        with self.driver.session() as session:
            session.execute_write(self._clear_all)

    @staticmethod
    def _clear_all(tx):
        tx.run("MATCH (n) DETACH DELETE n")

    def create_package_node(self, name, version, has_vulnerability=False, vulnerabilities=None):
        with self.driver.session() as session:
            return session.execute_write(
                self._create_package_node, 
                name, 
                version, 
                has_vulnerability,
                vulnerabilities
            )

    @staticmethod
    def _create_package_node(tx, name, version, has_vulnerability, vulnerabilities):
        result = tx.run(
            """
            MERGE (p:Package {name: $name, version: $version})
            SET p.has_vulnerability = $has_vulnerability,
                p.vulnerabilities = $vulnerabilities
            RETURN p
            """,
            name=name,
            version=version,
            has_vulnerability=has_vulnerability,
            vulnerabilities=vulnerabilities or []
        )
        return result.single()['p']

    def create_dependency_relationship(self, parent_name, parent_version, child_name, child_version, version_range):
        with self.driver.session() as session:
            session.execute_write(
                self._create_dependency_relationship,
                parent_name,
                parent_version,
                child_name,
                child_version,
                version_range
            )

    @staticmethod
    def _create_dependency_relationship(tx, parent_name, parent_version, child_name, child_version, version_range):
        tx.run(
            """
            MATCH (parent:Package {name: $parent_name, version: $parent_version})
            MATCH (child:Package {name: $child_name, version: $child_version})
            MERGE (parent)-[r:DEPENDS_ON {version_range: $version_range}]->(child)
            """,
            parent_name=parent_name,
            parent_version=parent_version,
            child_name=child_name,
            child_version=child_version,
            version_range=version_range
        )

    def get_package_graph(self, package_name, package_version, max_level=2):
        with self.driver.session() as session:
            return session.execute_read(
                self._get_package_graph,
                package_name,
                package_version,
                max_level
            )

    @staticmethod
    def _get_package_graph(tx, package_name, package_version, max_level):
        result = tx.run(
            """
            MATCH (root:Package {name: $name, version: $version})
            CALL apoc.path.subgraphAll(root, {
                relationshipFilter: "DEPENDS_ON>",
                minLevel: 0,
                maxLevel: $max_level
            })
            YIELD nodes, relationships
            RETURN nodes, relationships
            """,
            name=package_name,
            version=package_version,
            max_level=max_level
        )
        
        record = result.single()
        if not record:
            return {"nodes": [], "links": []}

        nodes = []
        for node in record['nodes']:
            nodes.append({
                "id": f"{node['name']}@{node['version']}",
                "name": node['name'],
                "version": node['version'],
                "has_vulnerability": node.get('has_vulnerability', False),
                "_has_children": False
            })

        links = []
        for rel in record['relationships']:
            start_node = rel.start_node
            end_node = rel.end_node
            links.append({
                "source": f"{start_node['name']}@{start_node['version']}",
                "target": f"{end_node['name']}@{end_node['version']}",
                "version_range": rel.get('version_range', '')
            })

        node_ids = set(n['id'] for n in nodes)
        for node in nodes:
            children_result = tx.run(
                """
                MATCH (p:Package {name: $name, version: $version})-[r:DEPENDS_ON]->(child)
                RETURN count(child) > 0 AS has_children
                """,
                name=node['name'],
                version=node['version']
            )
            node['_has_children'] = children_result.single()['has_children']

        return {"nodes": nodes, "links": links}

    def get_direct_dependencies(self, package_name, package_version):
        with self.driver.session() as session:
            return session.execute_read(
                self._get_direct_dependencies,
                package_name,
                package_version
            )

    @staticmethod
    def _get_direct_dependencies(tx, package_name, package_version):
        result = tx.run(
            """
            MATCH (parent:Package {name: $name, version: $version})-[r:DEPENDS_ON]->(child:Package)
            RETURN child, r.version_range AS version_range
            """,
            name=package_name,
            version=package_version
        )
        
        nodes = []
        links = []
        parent_id = f"{package_name}@{package_version}"
        
        for record in result:
            child = record['child']
            child_id = f"{child['name']}@{child['version']}"
            
            nodes.append({
                "id": child_id,
                "name": child['name'],
                "version": child['version'],
                "has_vulnerability": child.get('has_vulnerability', False),
                "_has_children": False
            })
            
            links.append({
                "source": parent_id,
                "target": child_id,
                "version_range": record.get('version_range', '')
            })

        for node in nodes:
            children_result = tx.run(
                """
                MATCH (p:Package {name: $name, version: $version})-[r:DEPENDS_ON]->(child)
                RETURN count(child) > 0 AS has_children
                """,
                name=node['name'],
                version=node['version']
            )
            node['_has_children'] = children_result.single()['has_children']

        return {"nodes": nodes, "links": links}

    def package_exists(self, name, version):
        with self.driver.session() as session:
            return session.execute_read(self._package_exists, name, version)

    @staticmethod
    def _package_exists(tx, name, version):
        result = tx.run(
            """
            MATCH (p:Package {name: $name, version: $version})
            RETURN count(p) > 0 AS exists
            """,
            name=name,
            version=version
        )
        return result.single()['exists']

    def find_package_by_vulnerability(self, vuln_id):
        with self.driver.session() as session:
            return session.execute_read(self._find_package_by_vulnerability, vuln_id)

    @staticmethod
    def _find_package_by_vulnerability(tx, vuln_id):
        result = tx.run(
            """
            MATCH (p:Package)
            WHERE p.vulnerabilities IS NOT NULL
            AND ANY(vuln IN p.vulnerabilities WHERE vuln.id = $vuln_id)
            RETURN p
            """,
            vuln_id=vuln_id
        )
        
        packages = []
        for record in result:
            node = record['p']
            packages.append({
                "id": f"{node['name']}@{node['version']}",
                "name": node['name'],
                "version": node['version']
            })
        return packages

    def find_shortest_propagation_path(self, root_name, root_version, vuln_id):
        with self.driver.session() as session:
            return session.execute_write(
                self._find_shortest_propagation_path,
                root_name,
                root_version,
                vuln_id
            )

    @staticmethod
    def _find_shortest_propagation_path(tx, root_name, root_version, vuln_id):
        vuln_packages_result = tx.run(
            """
            MATCH (p:Package)
            WHERE p.vulnerabilities IS NOT NULL
            AND ANY(vuln IN p.vulnerabilities WHERE vuln.id = $vuln_id)
            RETURN p
            """,
            vuln_id=vuln_id
        )
        
        vuln_packages = []
        for record in vuln_packages_result:
            node = record['p']
            vuln_packages.append({
                "id": f"{node['name']}@{node['version']}",
                "name": node['name'],
                "version": node['version']
            })
        
        if not vuln_packages:
            return {"found": False, "message": "No package found with the given vulnerability ID"}
        
        shortest_path = None
        shortest_length = float('inf')
        source_package = None
        
        for vuln_pkg in vuln_packages:
            path_result = tx.run(
                """
                MATCH path = shortestPath(
                    (root:Package {name: $root_name, version: $root_version})-[:DEPENDS_ON*]->(vuln:Package {name: $vuln_name, version: $vuln_version})
                )
                RETURN path, length(path) AS path_length
                """,
                root_name=root_name,
                root_version=root_version,
                vuln_name=vuln_pkg['name'],
                vuln_version=vuln_pkg['version']
            )
            
            record = path_result.single()
            if record:
                path = record['path']
                path_length = record['path_length']
                if path_length < shortest_length:
                    shortest_length = path_length
                    shortest_path = path
                    source_package = vuln_pkg
        
        if not shortest_path:
            return {"found": False, "message": "No propagation path found from root to vulnerable package"}
        
        nodes = []
        for node in shortest_path.nodes:
            nodes.append({
                "id": f"{node['name']}@{node['version']}",
                "name": node['name'],
                "version": node['version'],
                "has_vulnerability": node.get('has_vulnerability', False)
            })
        
        links = []
        for rel in shortest_path.relationships:
            start_node = rel.start_node
            end_node = rel.end_node
            links.append({
                "source": f"{start_node['name']}@{start_node['version']}",
                "target": f"{end_node['name']}@{end_node['version']}",
                "version_range": rel.get('version_range', '')
            })
        
        return {
            "found": True,
            "vulnerability_id": vuln_id,
            "vulnerable_package": source_package,
            "path_length": shortest_length,
            "nodes": nodes,
            "links": links
        }

    def get_all_vulnerabilities(self, package_name, package_version):
        with self.driver.session() as session:
            return session.execute_read(self._get_all_vulnerabilities, package_name, package_version)

    @staticmethod
    def _get_all_vulnerabilities(tx, package_name, package_version):
        result = tx.run(
            """
            MATCH (p:Package {name: $name, version: $version})
            RETURN p.vulnerabilities AS vulnerabilities
            """,
            name=package_name,
            version=package_version
        )
        
        record = result.single()
        if not record:
            return []
        
        return record.get('vulnerabilities', [])

db = Neo4jDatabase()
