#include <zmq.hpp>
#include <iostream>
#include <fstream>
#include <string>
#include <sstream>
#include <chrono>
#include <thread>

int main(int argc, char* argv[]) {
    try {
        zmq::context_t context(1);
        zmq::socket_t socket(context, ZMQ_PUSH);
        
        std::cout << "启动 Publisher，绑定到 tcp://*:5557" << std::endl;
        socket.bind("tcp://*:5557");
        
        std::string filename = (argc > 1) ? argv[1] : "tasks.txt";
        std::ifstream file(filename);
        
        if (!file.is_open()) {
            std::cerr << "无法打开文件: " << filename << std::endl;
            return 1;
        }
        
        std::string line;
        int task_id = 0;
        
        std::cout << "等待 Worker 连接... (2秒)" << std::endl;
        std::this_thread::sleep_for(std::chrono::seconds(2));
        
        std::cout << "开始发送任务..." << std::endl;
        
        while (std::getline(file, line)) {
            if (line.empty()) continue;
            
            task_id++;
            
            std::ostringstream oss;
            oss << task_id << "," << line;
            std::string message = oss.str();
            
            zmq::message_t zmq_msg(message.data(), message.size());
            
            std::cout << "发送任务 #" << task_id << ": " << line << std::endl;
            socket.send(zmq_msg);
            
            std::this_thread::sleep_for(std::chrono::milliseconds(100));
        }
        
        std::cout << "所有任务发送完成，共 " << task_id << " 个任务" << std::endl;
        
        std::this_thread::sleep_for(std::chrono::seconds(1));
        
        socket.close();
        context.close();
        
    } catch (const std::exception& e) {
        std::cerr << "错误: " << e.what() << std::endl;
        return 1;
    }
    
    return 0;
}
