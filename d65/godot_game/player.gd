extends CharacterBody2D

const SPEED = 300.0
const JUMP_VELOCITY = -500.0

var gravity = ProjectSettings.get_setting("physics/2d/default_gravity")

@onready var sprite_2d = $Sprite2D
@onready var collision_shape_2d = $CollisionShape2D

func _physics_process(delta):
	if not is_on_floor():
		velocity.y += gravity * delta

	var input_dir = Input.get_axis("move_left", "move_right")
	if input_dir:
		velocity.x = input_dir * SPEED
		if input_dir < 0:
			sprite_2d.flip_h = true
		else:
			sprite_2d.flip_h = false
	else:
		velocity.x = move_toward(velocity.x, 0, SPEED)

	if Input.is_action_just_pressed("jump") and is_on_floor():
		velocity.y = JUMP_VELOCITY

	move_and_slide()
