import { Controller, Post, Body, Get, Param, HttpException, HttpStatus } from '@nestjs/common';
import { RoomService } from './room.service';

class CreateRoomDto {
  name: string;
  creator: string;
}

class JoinRoomDto {
  username: string;
}

class LockRoomDto {
  username: string;
}

@Controller('rooms')
export class RoomController {
  constructor(private readonly roomService: RoomService) {}

  @Post()
  async createRoom(@Body() createRoomDto: CreateRoomDto) {
    return this.roomService.createRoom(createRoomDto.name, createRoomDto.creator);
  }

  @Post(':roomId/join')
  async joinRoom(@Param('roomId') roomId: string, @Body() joinRoomDto: JoinRoomDto) {
    try {
      return await this.roomService.joinRoom(roomId, joinRoomDto.username);
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.NOT_FOUND);
    }
  }

  @Get(':roomId')
  async getRoom(@Param('roomId') roomId: string) {
    const room = await this.roomService.getRoom(roomId);
    if (!room) {
      throw new HttpException('Room not found', HttpStatus.NOT_FOUND);
    }
    return room;
  }

  @Post(':roomId/lock')
  async lockRoom(@Param('roomId') roomId: string, @Body() lockRoomDto: LockRoomDto) {
    try {
      return await this.roomService.lockRoom(roomId, lockRoomDto.username);
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.FORBIDDEN);
    }
  }

  @Post(':roomId/unlock')
  async unlockRoom(@Param('roomId') roomId: string, @Body() lockRoomDto: LockRoomDto) {
    try {
      return await this.roomService.unlockRoom(roomId, lockRoomDto.username);
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.FORBIDDEN);
    }
  }
}
