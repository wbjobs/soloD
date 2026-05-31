extends Node2D

var tcp_server: TCP_Server
var client_peer: StreamPeerTCP
var level_elements: Array = []
var receive_buffer: PackedByteArray = PackedByteArray()
var coin_counter: int = 0

func _ready():
	tcp_server = TCP_Server.new()
	var status = tcp_server.listen(8888)
	if status == OK:
		print("TCP 服务器已启动，监听端口 8888")
	else:
		print("TCP 服务器启动失败，错误码: ", status)

func _process(delta: float):
	if tcp_server.is_connection_available():
		if not client_peer or client_peer.get_status() != StreamPeerTCP.STATUS_CONNECTED:
			client_peer = tcp_server.take_connection()
			print("客户端已连接")
	
	if client_peer and client_peer.get_status() == StreamPeerTCP.STATUS_CONNECTED:
		client_peer.poll()
		poll_network()

func poll_network():
	var available_bytes = client_peer.get_available_bytes()
	if available_bytes > 0:
		var data = client_peer.get_partial_data(available_bytes)
		if data[0] == OK:
			receive_buffer.append_array(data[1])
			try_parse_message()

func try_parse_message():
	if receive_buffer.size() == 0:
		return
	
	var json_string = receive_buffer.get_string_from_utf8()
	receive_buffer.clear()
	
	if json_string.length() > 0:
		print("收到数据: ", json_string)
		parse_level_data(json_string)

func send_message(data: Dictionary):
	if client_peer and client_peer.get_status() == StreamPeerTCP.STATUS_CONNECTED:
		var json = JSON.new()
		var json_string = json.stringify(data)
		client_peer.put_data(json_string.to_utf8_buffer())
		print("发送消息: ", json_string)

func parse_level_data(json_data: String):
	for element in level_elements:
		if is_instance_valid(element):
			element.queue_free()
	level_elements.clear()
	coin_counter = 0
	
	var json = JSON.new()
	var parse_result = json.parse(json_data)
	
	if parse_result != OK:
		print("JSON 解析错误: ", json.get_error_message())
		print("错误位置: 行 ", json.get_error_line())
		return
	
	var data = json.get_data()
	
	if data is Array:
		print("成功解析 ", len(data), " 个关卡元素")
		for item in data:
			if item is Dictionary:
				spawn_element(item)
			else:
				print("警告: 元素不是 Dictionary 类型")
	else:
		print("JSON 根节点不是 Array 类型，而是: ", typeof(data))

func spawn_element(item: Dictionary):
	var element_type = item.get("type", "")
	var x = float(item.get("x", 0))
	var y = float(item.get("y", 0))
	var width = float(item.get("width", 100))
	var height = float(item.get("height", 50))
	
	var node = null
	
	match element_type:
		"platform":
			node = create_platform(x, y, width, height)
		"enemy":
			node = create_enemy(x, y, width, height)
		"coin":
			coin_counter += 1
			var coin_id = "coin_" + str(coin_counter)
			node = create_coin(x, y, width, height, coin_id)
		_:
			print("未知元素类型: ", element_type)
	
	if node:
		add_child(node)
		level_elements.append(node)

func create_platform(x: float, y: float, width: float, height: float):
	var platform = StaticBody2D.new()
	platform.position = Vector2(x + width/2, y + height/2)
	
	var sprite = ColorRect.new()
	sprite.size = Vector2(width, height)
	sprite.position = Vector2(-width/2, -height/2)
	sprite.color = Color(0.2, 0.8, 0.3)
	platform.add_child(sprite)
	
	var collision = CollisionShape2D.new()
	var shape = RectangleShape2D.new()
	shape.size = Vector2(width, height)
	collision.shape = shape
	platform.add_child(collision)
	
	return platform

func create_enemy(x: float, y: float, width: float, height: float):
	var enemy = CharacterBody2D.new()
	enemy.position = Vector2(x + width/2, y + height/2)
	
	var sprite = ColorRect.new()
	sprite.size = Vector2(width, height)
	sprite.position = Vector2(-width/2, -height/2)
	sprite.color = Color(0.8, 0.2, 0.2)
	enemy.add_child(sprite)
	
	var collision = CollisionShape2D.new()
	var shape = RectangleShape2D.new()
	shape.size = Vector2(width, height)
	collision.shape = shape
	enemy.add_child(collision)
	
	return enemy

func create_coin(x: float, y: float, width: float, height: float, coin_id: String):
	var coin = Area2D.new()
	coin.position = Vector2(x + width/2, y + height/2)
	coin.name = coin_id
	
	var sprite = ColorRect.new()
	sprite.size = Vector2(width, height)
	sprite.position = Vector2(-width/2, -height/2)
	sprite.color = Color(1.0, 0.9, 0.2)
	coin.add_child(sprite)
	
	var collision = CollisionShape2D.new()
	var shape = CircleShape2D.new()
	shape.radius = min(width, height) / 2
	collision.shape = shape
	coin.add_child(collision)
	
	coin.body_entered.connect(func(body):
		if body.name == "Player":
			print("收集到金币: ", coin_id)
			send_message({"event": "coin_collected", "id": coin_id})
			coin.queue_free()
	)
	
	return coin
