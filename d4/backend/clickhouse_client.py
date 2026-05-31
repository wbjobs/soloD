from clickhouse_driver import Client
from typing import List, Dict, Any, Optional
from datetime import datetime
from queue import Queue, Empty
from threading import Lock, Thread
import time
import logging
from functools import wraps

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def retry(max_retries=3, delay=1, backoff=2):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            mtries, mdelay = max_retries, delay
            while mtries > 1:
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    logger.warning(f"Retry {func.__name__} failed, {mtries-1} retries left: {str(e)}")
                    time.sleep(mdelay)
                    mtries -= 1
                    mdelay *= backoff
            return func(*args, **kwargs)
        return wrapper
    return decorator


class ClickHousePool:
    def __init__(self, host='localhost', port=9000, database='user_behavior', pool_size=5):
        self.host = host
        self.port = port
        self.database = database
        self.pool_size = pool_size
        self.pool: Queue = Queue(maxsize=pool_size)
        self.lock = Lock()
        self._initialize_pool()

    def _create_connection(self):
        try:
            return Client(
                host=self.host,
                port=self.port,
                database=self.database,
                settings={
                    'use_numpy': True,
                    'insert_quorum': 1,
                    'insert_distributed_sync': 1,
                    'max_insert_block_size': 100000,
                }
            )
        except Exception as e:
            logger.error(f"Failed to create ClickHouse connection: {str(e)}")
            raise

    def _initialize_pool(self):
        for _ in range(self.pool_size):
            try:
                conn = self._create_connection()
                self.pool.put(conn)
            except Exception as e:
                logger.error(f"Failed to initialize pool connection: {str(e)}")

    def get_connection(self):
        try:
            conn = self.pool.get(timeout=5)
            if not self._is_connection_alive(conn):
                conn = self._create_connection()
            return conn
        except Empty:
            logger.warning("Connection pool exhausted, creating new connection")
            return self._create_connection()

    def release_connection(self, conn):
        try:
            if self._is_connection_alive(conn):
                self.pool.put_nowait(conn)
            else:
                conn.disconnect()
        except Exception as e:
            logger.warning(f"Failed to release connection: {str(e)}")

    def _is_connection_alive(self, conn):
        try:
            conn.execute("SELECT 1")
            return True
        except:
            return False

    def close_all(self):
        while not self.pool.empty():
            try:
                conn = self.pool.get_nowait()
                conn.disconnect()
            except:
                pass


class AsyncBuffer:
    def __init__(self, client_pool, batch_size=1000, flush_interval=1.0):
        self.client_pool = client_pool
        self.batch_size = batch_size
        self.flush_interval = flush_interval
        self.buffer: List = []
        self.lock = Lock()
        self.running = True
        self.flush_thread = Thread(target=self._flush_loop, daemon=True)
        self.flush_thread.start()
        self.last_flush_time = time.time()

    def add_events(self, events: List[Dict]):
        with self.lock:
            self.buffer.extend(events)
            if len(self.buffer) >= self.batch_size:
                self._flush()

    def _flush_loop(self):
        while self.running:
            time.sleep(self.flush_interval)
            try:
                with self.lock:
                    if len(self.buffer) > 0 and time.time() - self.last_flush_time >= self.flush_interval:
                        self._flush()
            except Exception as e:
                logger.error(f"Flush loop error: {str(e)}")

    @retry(max_retries=3, delay=0.5)
    def _flush(self):
        if not self.buffer:
            return

        batch = self.buffer.copy()
        self.buffer.clear()
        self.last_flush_time = time.time()

        conn = None
        try:
            conn = self.client_pool.get_connection()
            query = '''
                INSERT INTO user_events (
                    event_id, user_id, session_id, event_type, page_url,
                    referrer, user_agent, ip_address, country, city,
                    device_type, browser, os, event_properties, timestamp
                ) VALUES
            '''
            conn.execute(query, batch)
            logger.info(f"Successfully flushed {len(batch)} events")
        except Exception as e:
            logger.error(f"Failed to flush batch: {str(e)}, re-buffering")
            with self.lock:
                self.buffer.extend(batch)
            raise
        finally:
            if conn:
                self.client_pool.release_connection(conn)

    def shutdown(self):
        self.running = False
        with self.lock:
            self._flush()


class ClickHouseClient:
    def __init__(self, host='localhost', port=9000, database='user_behavior'):
        self.pool = ClickHousePool(host, port, database, pool_size=5)
        self.buffer = AsyncBuffer(self.pool, batch_size=500, flush_interval=0.5)
        self.query_cache: Dict[str, tuple] = {}
        self.cache_ttl = 1.0

    def insert_events(self, events: List[Dict[str, Any]]):
        formatted = []
        for event in events:
            formatted.append({
                'event_id': event.get('event_id', ''),
                'user_id': event.get('user_id', ''),
                'session_id': event.get('session_id', ''),
                'event_type': event.get('event_type', ''),
                'page_url': event.get('page_url', ''),
                'referrer': event.get('referrer', ''),
                'user_agent': event.get('user_agent', ''),
                'ip_address': event.get('ip_address', ''),
                'country': event.get('country', ''),
                'city': event.get('city', ''),
                'device_type': event.get('device_type', ''),
                'browser': event.get('browser', ''),
                'os': event.get('os', ''),
                'event_properties': event.get('event_properties', {}),
                'timestamp': event.get('timestamp', datetime.now())
            })
        self.buffer.add_events(formatted)
        return len(formatted)

    def _cached_query(self, cache_key: str, query_func):
        now = time.time()
        if cache_key in self.query_cache:
            result, timestamp = self.query_cache[cache_key]
            if now - timestamp < self.cache_ttl:
                return result
        
        result = query_func()
        self.query_cache[cache_key] = (result, now)
        return result

    def get_realtime_stats(self):
        def query():
            conn = None
            try:
                conn = self.pool.get_connection()
                query = '''
                    SELECT
                        count() as pv,
                        uniqExact(user_id) as uv,
                        uniqExact(session_id) as sessions
                    FROM user_events
                    WHERE timestamp >= now() - INTERVAL 1 MINUTE
                '''
                result = conn.execute(query)
                return {
                    'pv': int(result[0][0]),
                    'uv': int(result[0][1]),
                    'sessions': int(result[0][2])
                }
            finally:
                if conn:
                    self.pool.release_connection(conn)
        
        return self._cached_query('realtime_stats', query)

    def get_hourly_trend(self, hours=24):
        def query():
            conn = None
            try:
                conn = self.pool.get_connection()
                query = f'''
                    SELECT
                        toStartOfHour(timestamp) as hour,
                        count() as pv,
                        uniqExact(user_id) as uv
                    FROM user_events
                    WHERE timestamp >= now() - INTERVAL {hours} HOUR
                    GROUP BY hour
                    ORDER BY hour
                '''
                result = conn.execute(query)
                return [
                    {
                        'hour': row[0].isoformat(),
                        'pv': int(row[1]),
                        'uv': int(row[2])
                    }
                    for row in result
                ]
            finally:
                if conn:
                    self.pool.release_connection(conn)
        
        return self._cached_query(f'hourly_trend_{hours}', query)

    def get_daily_pv_uv(self, days=7):
        def query():
            conn = None
            try:
                conn = self.pool.get_connection()
                query = f'''
                    SELECT
                        toDate(timestamp) as day,
                        count() as pv,
                        uniqExact(user_id) as uv
                    FROM user_events
                    WHERE timestamp >= now() - INTERVAL {days} DAY
                    GROUP BY day
                    ORDER BY day
                '''
                result = conn.execute(query)
                return [
                    {
                        'day': row[0].isoformat(),
                        'pv': int(row[1]),
                        'uv': int(row[2])
                    }
                    for row in result
                ]
            finally:
                if conn:
                    self.pool.release_connection(conn)
        
        return self._cached_query(f'daily_pv_uv_{days}', query)

    def get_top_pages(self, limit=10):
        def query():
            conn = None
            try:
                conn = self.pool.get_connection()
                query = f'''
                    SELECT
                        page_url,
                        count() as views,
                        uniqExact(user_id) as unique_users
                    FROM user_events
                    WHERE event_type = 'page_view'
                      AND timestamp >= now() - INTERVAL 1 DAY
                    GROUP BY page_url
                    ORDER BY views DESC
                    LIMIT {limit}
                '''
                result = conn.execute(query)
                return [
                    {
                        'page_url': row[0],
                        'views': int(row[1]),
                        'unique_users': int(row[2])
                    }
                    for row in result
                ]
            finally:
                if conn:
                    self.pool.release_connection(conn)
        
        return self._cached_query(f'top_pages_{limit}', query)

    def get_countries(self):
        def query():
            conn = None
            try:
                conn = self.pool.get_connection()
                query = '''
                    SELECT
                        country,
                        count() as count,
                        uniqExact(user_id) as users
                    FROM user_events
                    WHERE country != ''
                      AND timestamp >= now() - INTERVAL 1 DAY
                    GROUP BY country
                    ORDER BY count DESC
                '''
                result = conn.execute(query)
                return [
                    {
                        'country': row[0],
                        'count': int(row[1]),
                        'users': int(row[2])
                    }
                    for row in result
                ]
            finally:
                if conn:
                    self.pool.release_connection(conn)
        
        return self._cached_query('countries', query)

    def get_device_types(self):
        def query():
            conn = None
            try:
                conn = self.pool.get_connection()
                query = '''
                    SELECT
                        device_type,
                        count() as count
                    FROM user_events
                    WHERE device_type != ''
                      AND timestamp >= now() - INTERVAL 1 DAY
                    GROUP BY device_type
                '''
                result = conn.execute(query)
                return [
                    {
                        'device_type': row[0],
                        'count': int(row[1])
                    }
                    for row in result
                ]
            finally:
                if conn:
                    self.pool.release_connection(conn)
        
        return self._cached_query('devices', query)

    def get_funnel_analysis(self, funnel_steps: List[Dict[str, str]]):
        if not funnel_steps:
            return []
        
        conn = None
        try:
            conn = self.pool.get_connection()
            conditions = []
            for step in funnel_steps:
                event_type = step.get('event_type', 'page_view')
                page_url = step.get('page_url', '')
                if page_url:
                    conditions.append(f"(event_type = '{event_type}' AND page_url LIKE '%{page_url}%')")
                else:
                    conditions.append(f"event_type = '{event_type}'")

            subqueries = []
            for cond in conditions:
                subqueries.append(f'''
                    SELECT DISTINCT user_id, session_id
                    FROM user_events
                    WHERE {cond}
                      AND timestamp >= now() - INTERVAL 7 DAY
                ''')

            results = []
            for i in range(len(subqueries)):
                join_conds = []
                for j in range(i + 1):
                    join_conds.append(f'''
                        SELECT user_id, session_id FROM (
                            {subqueries[j]}
                        ) t{j}
                    ''')
                
                intersect_query = ' INTERSECT '.join(join_conds)
                count_query = f'SELECT count() FROM ({intersect_query})'
                result = conn.execute(count_query)
                users = int(result[0][0])
                conversion = 100.0 if i == 0 else (users / results[0]['users'] * 100 if results[0]['users'] > 0 else 0)
                results.append({
                    'step': i,
                    'step_name': funnel_steps[i].get('name', f'Step {i+1}'),
                    'users': users,
                    'conversion_rate': round(conversion, 2)
                })

            return results
        finally:
            if conn:
                self.pool.release_connection(conn)

    def get_user_paths(self, limit=1000):
        def query():
            conn = None
            try:
                conn = self.pool.get_connection()
                query = f'''
                    SELECT
                        user_id,
                        session_id,
                        groupArray(page_url) as path,
                        groupArray(event_type) as events,
                        groupArray(timestamp) as timestamps
                    FROM user_events
                    WHERE timestamp >= now() - INTERVAL 1 DAY
                    GROUP BY user_id, session_id
                    ORDER BY max(timestamp) DESC
                    LIMIT {limit}
                '''
                result = conn.execute(query)
                return [
                    {
                        'user_id': row[0],
                        'session_id': row[1],
                        'path': row[2],
                        'events': row[3],
                        'timestamps': [ts.isoformat() for ts in row[4]]
                    }
                    for row in result
                ]
            finally:
                if conn:
                    self.pool.release_connection(conn)
        
        return self._cached_query(f'user_paths_{limit}', query)

    def execute_query(self, sql: str):
        conn = None
        try:
            conn = self.pool.get_connection()
            result = conn.execute(sql)
            if not result:
                return []
            
            columns = [desc[0] for desc in conn.execute(f'EXPLAIN description = 0 ' + sql.split('FROM')[0].replace('SELECT', 'SELECT'))]
            if not columns or len(columns) != len(result[0]):
                columns = [f'col_{i}' for i in range(len(result[0]))]
            
            return [dict(zip(columns, row)) for row in result]
        except Exception as e:
            raise Exception(f"SQL执行错误: {str(e)}")
        finally:
            if conn:
                self.pool.release_connection(conn)

    def create_alert_rule(self, rule: Dict):
        conn = None
        try:
            conn = self.pool.get_connection()
            query = '''
                INSERT INTO alert_rules (
                    rule_id, rule_name, metric, condition, 
                    threshold, window_minutes, enabled, created_at, updated_at
                ) VALUES
            '''
            now = datetime.now()
            data = [{
                'rule_id': rule.get('rule_id'),
                'rule_name': rule.get('rule_name'),
                'metric': rule.get('metric'),
                'condition': rule.get('condition'),
                'threshold': float(rule.get('threshold')),
                'window_minutes': int(rule.get('window_minutes', 5)),
                'enabled': 1,
                'created_at': now,
                'updated_at': now
            }]
            conn.execute(query, data)
            return data[0]
        finally:
            if conn:
                self.pool.release_connection(conn)

    def get_alert_rules(self):
        conn = None
        try:
            conn = self.pool.get_connection()
            query = '''
                SELECT rule_id, rule_name, metric, condition, threshold, window_minutes, enabled
                FROM alert_rules FINAL
                ORDER BY created_at DESC
            '''
            result = conn.execute(query)
            return [
                {
                    'rule_id': row[0],
                    'rule_name': row[1],
                    'metric': row[2],
                    'condition': row[3],
                    'threshold': float(row[4]),
                    'window_minutes': int(row[5]),
                    'enabled': bool(row[6])
                }
                for row in result
            ]
        finally:
            if conn:
                self.pool.release_connection(conn)

    def delete_alert_rule(self, rule_id: str):
        conn = None
        try:
            conn = self.pool.get_connection()
            conn.execute(f"ALTER TABLE alert_rules DELETE WHERE rule_id = '{rule_id}'")
            return True
        finally:
            if conn:
                self.pool.release_connection(conn)

    def check_anomalies(self):
        conn = None
        try:
            conn = self.pool.get_connection()
            rules = self.get_alert_rules()
            enabled_rules = [r for r in rules if r['enabled']]
            
            anomalies = []
            for rule in enabled_rules:
                metric = rule['metric']
                window = rule['window_minutes']
                
                if metric == 'pv':
                    result = conn.execute(f'''
                        SELECT count() FROM user_events 
                        WHERE timestamp >= now() - INTERVAL {window} MINUTE
                    ''')
                    current_value = int(result[0][0])
                elif metric == 'uv':
                    result = conn.execute(f'''
                        SELECT uniqExact(user_id) FROM user_events 
                        WHERE timestamp >= now() - INTERVAL {window} MINUTE
                    ''')
                    current_value = int(result[0][0])
                elif metric == 'events_per_session':
                    result = conn.execute(f'''
                        SELECT count() / uniqExact(session_id) FROM user_events 
                        WHERE timestamp >= now() - INTERVAL {window} MINUTE
                    ''')
                    current_value = float(result[0][0]) if result[0][0] else 0.0
                elif metric == 'error_rate':
                    result = conn.execute(f'''
                        SELECT 
                            if(sum_total > 0, sum_error / sum_total, 0) as error_rate
                        FROM (
                            SELECT 
                                count() as sum_total,
                                sum(if(event_type = 'error', 1, 0)) as sum_error
                            FROM user_events 
                            WHERE timestamp >= now() - INTERVAL {window} MINUTE
                        )
                    ''')
                    current_value = float(result[0][0]) if result[0][0] else 0.0
                else:
                    continue
                
                threshold = rule['threshold']
                condition = rule['condition']
                is_anomaly = False
                
                if condition == '>':
                    is_anomaly = current_value > threshold
                elif condition == '>=':
                    is_anomaly = current_value >= threshold
                elif condition == '<':
                    is_anomaly = current_value < threshold
                elif condition == '<=':
                    is_anomaly = current_value <= threshold
                elif condition == '=':
                    is_anomaly = current_value == threshold
                
                if is_anomaly:
                    anomalies.append({
                        'rule_id': rule['rule_id'],
                        'rule_name': rule['rule_name'],
                        'metric': metric,
                        'current_value': current_value,
                        'threshold': threshold,
                        'condition': condition,
                        'severity': 'high' if abs(current_value - threshold) > threshold * 0.5 else 'medium'
                    })
            
            return anomalies
        finally:
            if conn:
                self.pool.release_connection(conn)

    def get_alert_history(self, limit: int = 100):
        conn = None
        try:
            conn = self.pool.get_connection()
            query = f'''
                SELECT alert_id, rule_id, rule_name, metric, current_value, 
                       threshold, condition, severity, status, triggered_at, resolved_at, message
                FROM alert_history
                ORDER BY triggered_at DESC
                LIMIT {limit}
            '''
            result = conn.execute(query)
            return [
                {
                    'alert_id': row[0],
                    'rule_id': row[1],
                    'rule_name': row[2],
                    'metric': row[3],
                    'current_value': float(row[4]),
                    'threshold': float(row[5]),
                    'condition': row[6],
                    'severity': row[7],
                    'status': row[8],
                    'triggered_at': row[9].isoformat() if row[9] else None,
                    'resolved_at': row[10].isoformat() if row[10] else None,
                    'message': row[11]
                }
                for row in result
            ]
        finally:
            if conn:
                self.pool.release_connection(conn)

    def create_alert(self, alert: Dict):
        conn = None
        try:
            conn = self.pool.get_connection()
            query = '''
                INSERT INTO alert_history (
                    alert_id, rule_id, rule_name, metric, current_value,
                    threshold, condition, severity, status, triggered_at, message
                ) VALUES
            '''
            data = [{
                'alert_id': alert.get('alert_id'),
                'rule_id': alert.get('rule_id'),
                'rule_name': alert.get('rule_name'),
                'metric': alert.get('metric'),
                'current_value': float(alert.get('current_value')),
                'threshold': float(alert.get('threshold')),
                'condition': alert.get('condition'),
                'severity': alert.get('severity', 'medium'),
                'status': 'triggered',
                'triggered_at': datetime.now(),
                'message': alert.get('message', '')
            }]
            conn.execute(query, data)
            return data[0]
        finally:
            if conn:
                self.pool.release_connection(conn)

    def generate_user_tags(self):
        conn = None
        try:
            conn = self.pool.get_connection()
            
            tags_batch = []
            now = datetime.now()
            
            active_users_result = conn.execute('''
                SELECT user_id, count() as events_count, 
                       countDistinct(session_id) as sessions_count,
                       max(timestamp) as last_seen,
                       min(timestamp) as first_seen
                FROM user_events 
                WHERE timestamp >= now() - INTERVAL 7 DAY
                GROUP BY user_id
            ''')
            
            for row in active_users_result:
                user_id, events_count, sessions_count, last_seen, first_seen = row
                
                if events_count > 50:
                    tags_batch.append({
                        'user_id': user_id,
                        'tag_name': 'activity_level',
                        'tag_value': 'high',
                        'tag_category': 'behavior',
                        'confidence': 0.9,
                        'first_detected': first_seen,
                        'last_updated': now
                    })
                elif events_count > 10:
                    tags_batch.append({
                        'user_id': user_id,
                        'tag_name': 'activity_level',
                        'tag_value': 'medium',
                        'tag_category': 'behavior',
                        'confidence': 0.9,
                        'first_detected': first_seen,
                        'last_updated': now
                    })
                else:
                    tags_batch.append({
                        'user_id': user_id,
                        'tag_name': 'activity_level',
                        'tag_value': 'low',
                        'tag_category': 'behavior',
                        'confidence': 0.9,
                        'first_detected': first_seen,
                        'last_updated': now
                    })
                
                days_since_active = (now - last_seen).total_seconds() / 86400
                if days_since_active > 7:
                    tags_batch.append({
                        'user_id': user_id,
                        'tag_name': 'user_status',
                        'tag_value': 'inactive',
                        'tag_category': 'status',
                        'confidence': 0.85,
                        'first_detected': first_seen,
                        'last_updated': now
                    })
                else:
                    tags_batch.append({
                        'user_id': user_id,
                        'tag_name': 'user_status',
                        'tag_value': 'active',
                        'tag_category': 'status',
                        'confidence': 0.95,
                        'first_detected': first_seen,
                        'last_updated': now
                    })
                
                if sessions_count > 10:
                    tags_batch.append({
                        'user_id': user_id,
                        'tag_name': 'user_type',
                        'tag_value': 'power_user',
                        'tag_category': 'classification',
                        'confidence': 0.8,
                        'first_detected': first_seen,
                        'last_updated': now
                    })
            
            device_result = conn.execute('''
                SELECT user_id, device_type, count() as cnt
                FROM user_events
                WHERE timestamp >= now() - INTERVAL 7 DAY
                GROUP BY user_id, device_type
                ORDER BY user_id, cnt DESC
            ''')
            
            for row in device_result:
                user_id, device_type, cnt = row
                tags_batch.append({
                    'user_id': user_id,
                    'tag_name': 'preferred_device',
                    'tag_value': device_type,
                    'tag_category': 'demographic',
                    'confidence': 0.9,
                    'first_detected': now,
                    'last_updated': now
                })
            
            country_result = conn.execute('''
                SELECT user_id, country, count() as cnt
                FROM user_events
                WHERE country != '' AND timestamp >= now() - INTERVAL 7 DAY
                GROUP BY user_id, country
                ORDER BY user_id, cnt DESC
            ''')
            
            for row in country_result:
                user_id, country, cnt = row
                tags_batch.append({
                    'user_id': user_id,
                    'tag_name': 'country',
                    'tag_value': country,
                    'tag_category': 'demographic',
                    'confidence': 0.95,
                    'first_detected': now,
                    'last_updated': now
                })
            
            if tags_batch:
                query = '''
                    INSERT INTO user_tags (
                        user_id, tag_name, tag_value, tag_category, 
                        confidence, first_detected, last_updated
                    ) VALUES
                '''
                conn.execute(query, tags_batch)
            
            return len(tags_batch)
        finally:
            if conn:
                self.pool.release_connection(conn)

    def get_user_profile(self, user_id: str):
        conn = None
        try:
            conn = self.pool.get_connection()
            
            stats_result = conn.execute(f'''
                SELECT 
                    count() as total_events,
                    countDistinct(session_id) as total_sessions,
                    min(timestamp) as first_seen,
                    max(timestamp) as last_seen,
                    countDistinct(page_url) as unique_pages
                FROM user_events
                WHERE user_id = '{user_id}'
            ''')
            
            tags_result = conn.execute(f'''
                SELECT tag_name, tag_value, tag_category, confidence, last_updated
                FROM user_tags FINAL
                WHERE user_id = '{user_id}'
                ORDER BY tag_category, tag_name
            ''')
            
            recent_events_result = conn.execute(f'''
                SELECT event_type, page_url, timestamp
                FROM user_events
                WHERE user_id = '{user_id}'
                ORDER BY timestamp DESC
                LIMIT 20
            ''')
            
            profile = {
                'user_id': user_id,
                'stats': {
                    'total_events': int(stats_result[0][0]),
                    'total_sessions': int(stats_result[0][1]),
                    'first_seen': stats_result[0][2].isoformat() if stats_result[0][2] else None,
                    'last_seen': stats_result[0][3].isoformat() if stats_result[0][3] else None,
                    'unique_pages': int(stats_result[0][4])
                },
                'tags': [
                    {
                        'tag_name': row[0],
                        'tag_value': row[1],
                        'tag_category': row[2],
                        'confidence': float(row[3]),
                        'last_updated': row[4].isoformat() if row[4] else None
                    }
                    for row in tags_result
                ],
                'recent_events': [
                    {
                        'event_type': row[0],
                        'page_url': row[1],
                        'timestamp': row[2].isoformat() if row[2] else None
                    }
                    for row in recent_events_result
                ]
            }
            
            return profile
        finally:
            if conn:
                self.pool.release_connection(conn)

    def search_users(self, tag_filters: List[Dict] = None, limit: int = 100):
        conn = None
        try:
            conn = self.pool.get_connection()
            
            where_clauses = []
            if tag_filters:
                for f in tag_filters:
                    where_clauses.append(
                        f"(tag_name = '{f['tag_name']}' AND tag_value = '{f['tag_value']}')"
                    )
            
            if where_clauses:
                where_sql = f"WHERE {' OR '.join(where_clauses)}"
            else:
                where_sql = ""
            
            query = f'''
                SELECT user_id, groupArray((tag_name, tag_value)) as tags
                FROM user_tags FINAL
                {where_sql}
                GROUP BY user_id
                ORDER BY user_id
                LIMIT {limit}
            '''
            
            result = conn.execute(query)
            return [
                {
                    'user_id': row[0],
                    'tags': [{'tag_name': t[0], 'tag_value': t[1]} for t in row[1]]
                }
                for row in result
            ]
        finally:
            if conn:
                self.pool.release_connection(conn)

    def get_tag_summary(self):
        conn = None
        try:
            conn = self.pool.get_connection()
            query = '''
                SELECT tag_category, tag_name, tag_value, countDistinct(user_id) as user_count
                FROM user_tags FINAL
                GROUP BY tag_category, tag_name, tag_value
                ORDER BY tag_category, tag_name, user_count DESC
            '''
            result = conn.execute(query)
            return [
                {
                    'tag_category': row[0],
                    'tag_name': row[1],
                    'tag_value': row[2],
                    'user_count': int(row[3])
                }
                for row in result
            ]
        finally:
            if conn:
                self.pool.release_connection(conn)

    def export_events_csv(self, start_date: str = None, end_date: str = None, limit: int = 10000):
        conn = None
        try:
            conn = self.pool.get_connection()
            
            where_clauses = []
            if start_date:
                where_clauses.append(f"timestamp >= '{start_date}'")
            if end_date:
                where_clauses.append(f"timestamp <= '{end_date}'")
            
            where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
            
            query = f'''
                SELECT event_id, user_id, session_id, event_type, page_url,
                       referrer, user_agent, ip_address, country, city,
                       device_type, browser, os, timestamp
                FROM user_events
                {where_sql}
                ORDER BY timestamp DESC
                LIMIT {limit}
            '''
            
            result = conn.execute(query)
            columns = ['event_id', 'user_id', 'session_id', 'event_type', 'page_url',
                      'referrer', 'user_agent', 'ip_address', 'country', 'city',
                      'device_type', 'browser', 'os', 'timestamp']
            
            csv_rows = []
            csv_rows.append(','.join(columns))
            
            for row in result:
                formatted = []
                for i, val in enumerate(row):
                    if val is None:
                        formatted.append('')
                    elif isinstance(val, str):
                        escaped = val.replace('"', '""').replace('\n', ' ').replace('\r', '')
                        formatted.append(f'"{escaped}"')
                    else:
                        formatted.append(str(val))
                csv_rows.append(','.join(formatted))
            
            return '\n'.join(csv_rows)
        finally:
            if conn:
                self.pool.release_connection(conn)

    def export_user_profiles_csv(self, limit: int = 10000):
        conn = None
        try:
            conn = self.pool.get_connection()
            query = f'''
                SELECT 
                    ue.user_id,
                    count() as total_events,
                    countDistinct(ue.session_id) as total_sessions,
                    min(ue.timestamp) as first_seen,
                    max(ue.timestamp) as last_seen,
                    max(ue.country) as country,
                    max(ue.device_type) as device_type,
                    groupArray(DISTINCT (ut.tag_name, ut.tag_value)) as tags
                FROM user_events ue
                LEFT JOIN user_tags ut ON ue.user_id = ut.user_id
                GROUP BY ue.user_id
                ORDER BY total_events DESC
                LIMIT {limit}
            '''
            
            result = conn.execute(query)
            columns = ['user_id', 'total_events', 'total_sessions', 'first_seen', 
                      'last_seen', 'country', 'device_type', 'tags']
            
            csv_rows = []
            csv_rows.append(','.join(columns))
            
            for row in result:
                formatted = []
                for i, val in enumerate(row):
                    if val is None:
                        formatted.append('')
                    elif i == len(row) - 1:
                        tags_str = ';'.join([f'{t[0]}:{t[1]}' for t in val])
                        escaped = tags_str.replace('"', '""')
                        formatted.append(f'"{escaped}"')
                    elif isinstance(val, str):
                        escaped = val.replace('"', '""')
                        formatted.append(f'"{escaped}"')
                    else:
                        formatted.append(str(val))
                csv_rows.append(','.join(formatted))
            
            return '\n'.join(csv_rows)
        finally:
            if conn:
                self.pool.release_connection(conn)

    def close(self):
        self.buffer.shutdown()
        self.pool.close_all()
