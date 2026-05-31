#!/usr/bin/env python3
import uuid
import json
import subprocess
import pika
import threading
import time
import os
import signal

class TaskWorker:
    def __init__(self, rabbitmq_host='localhost', rabbitmq_port=5672, 
                 username='guest', password='guest'):
        self.worker_id = str(uuid.uuid4())
        self.rabbitmq_host = rabbitmq_host
        self.rabbitmq_port = rabbitmq_port
        self.username = username
        self.password = password
        self.task_queue = 'task_queue'
        self.result_queue = 'result_queue'
        self.control_exchange = 'control.exchange'
        self.connection = None
        self.channel = None
        self.current_process = None
        self.current_task_id = None
        self.task_lock = threading.Lock()
        
    def connect(self):
        credentials = pika.PlainCredentials(self.username, self.password)
        parameters = pika.ConnectionParameters(
            host=self.rabbitmq_host,
            port=self.rabbitmq_port,
            credentials=credentials,
            heartbeat=600,
            blocked_connection_timeout=300
        )
        self.connection = pika.BlockingConnection(parameters)
        self.channel = self.connection.channel()
        self.channel.queue_declare(queue=self.task_queue, durable=True)
        self.channel.queue_declare(queue=self.result_queue, durable=True)
        
        self.channel.exchange_declare(exchange=self.control_exchange, exchange_type='fanout')
        result = self.channel.queue_declare(queue='', exclusive=True)
        control_queue_name = result.method.queue
        self.channel.queue_bind(exchange=self.control_exchange, queue=control_queue_name)
        self.channel.basic_consume(queue=control_queue_name, on_message_callback=self.handle_control_message, auto_ack=True)
        
        self.channel.basic_qos(prefetch_count=1)
        
    def execute_command(self, command, timeout):
        try:
            self.current_process = subprocess.Popen(
                command,
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding='utf-8',
                errors='replace',
                preexec_fn=os.setsid if os.name != 'nt' else None
            )
            
            try:
                stdout, stderr = self.current_process.communicate(timeout=timeout)
                returncode = self.current_process.returncode
                
                return {
                    'success': returncode == 0,
                    'output': stdout + stderr,
                    'stdout': stdout,
                    'stderr': stderr,
                    'exit_code': returncode
                }
            except subprocess.TimeoutExpired:
                if self.current_process.poll() is None:
                    if os.name == 'nt':
                        self.current_process.kill()
                    else:
                        os.killpg(os.getpgid(self.current_process.pid), signal.SIGKILL)
                    stdout, stderr = self.current_process.communicate()
                else:
                    stdout, stderr = '', ''
                
                return {
                    'success': False,
                    'output': 'Task timeout exceeded\n' + stdout + stderr,
                    'stdout': stdout,
                    'stderr': stderr + '\nTask timeout exceeded',
                    'exit_code': -1
                }
                
        except Exception as e:
            error_msg = str(e)
            return {
                'success': False,
                'output': error_msg,
                'stdout': '',
                'stderr': error_msg,
                'exit_code': -2
            }
        finally:
            with self.task_lock:
                self.current_process = None
    
    def handle_control_message(self, ch, method, properties, body):
        try:
            control_msg = json.loads(body)
            msg_type = control_msg.get('type')
            target_task_id = control_msg.get('taskId')
            reason = control_msg.get('reason')
            
            if msg_type == 'KILL':
                with self.task_lock:
                    if self.current_task_id == target_task_id and self.current_process:
                        print(f"Received KILL signal for task {target_task_id}, reason: {reason}")
                        try:
                            if os.name == 'nt':
                                self.current_process.kill()
                            else:
                                os.killpg(os.getpgid(self.current_process.pid), signal.SIGKILL)
                            print(f"Task {target_task_id} killed successfully")
                        except Exception as e:
                            print(f"Failed to kill task {target_task_id}: {e}")
        except Exception as e:
            print(f"Error handling control message: {e}")
    
    def send_result(self, task_id, execution_result):
        result_message = {
            'taskId': task_id,
            'workerId': self.worker_id,
            'success': execution_result['success'],
            'output': execution_result['output'],
            'stdout': execution_result['stdout'],
            'stderr': execution_result['stderr'],
            'exitCode': execution_result['exit_code']
        }
        
        self.channel.basic_publish(
            exchange='',
            routing_key=self.result_queue,
            body=json.dumps(result_message),
            properties=pika.BasicProperties(
                delivery_mode=2,
                content_type='application/json'
            )
        )
        print(f"Sent result for task {task_id}: {'SUCCESS' if execution_result['success'] else 'FAILED'}")
    
    def process_task(self, ch, method, properties, body):
        try:
            task = json.loads(body)
            task_id = task['taskId']
            command = task['command']
            timeout = task.get('timeout', 3600)
            
            with self.task_lock:
                self.current_task_id = task_id
            
            print(f"Worker {self.worker_id} received task {task_id}")
            print(f"Executing command: {command} with timeout: {timeout}s")
            
            result = self.execute_command(command, timeout)
            
            print(f"Task {task_id} completed with exit code: {result['exit_code']}")
            if result['stdout']:
                print(f"STDOUT:\n{result['stdout']}")
            if result['stderr']:
                print(f"STDERR:\n{result['stderr']}")
            
            self.send_result(task_id, result)
            
            ch.basic_ack(delivery_tag=method.delivery_tag)
            
        except Exception as e:
            print(f"Error processing task: {e}")
            import traceback
            traceback.print_exc()
            ch.basic_nack(delivery_tag=method.delivery_tag, requeue=True)
        finally:
            with self.task_lock:
                self.current_task_id = None
    
    def start(self):
        print(f"Starting Task Worker {self.worker_id}")
        
        while True:
            try:
                self.connect()
                print(f"Connected to RabbitMQ at {self.rabbitmq_host}")
                print(f"Waiting for tasks on queue: {self.task_queue}")
                
                self.channel.basic_consume(
                    queue=self.task_queue,
                    on_message_callback=self.process_task
                )
                
                self.channel.start_consuming()
                
            except pika.exceptions.ConnectionClosedByBroker:
                print("Connection closed by broker. Reconnecting...")
                time.sleep(5)
            except pika.exceptions.AMQPChannelError as e:
                print(f"Channel error: {e}. Reconnecting...")
                time.sleep(5)
            except pika.exceptions.AMQPConnectionError:
                print("Connection error. Reconnecting...")
                time.sleep(5)
            except KeyboardInterrupt:
                print("Stopping worker...")
                if self.connection and not self.connection.is_closed:
                    self.connection.close()
                break
            except Exception as e:
                print(f"Unexpected error: {e}")
                time.sleep(5)

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='Task Worker')
    parser.add_argument('--host', default='localhost', help='RabbitMQ host')
    parser.add_argument('--port', type=int, default=5672, help='RabbitMQ port')
    parser.add_argument('--username', default='guest', help='RabbitMQ username')
    parser.add_argument('--password', default='guest', help='RabbitMQ password')
    
    args = parser.parse_args()
    
    worker = TaskWorker(
        rabbitmq_host=args.host,
        rabbitmq_port=args.port,
        username=args.username,
        password=args.password
    )
    worker.start()
