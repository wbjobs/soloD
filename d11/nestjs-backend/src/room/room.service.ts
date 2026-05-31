import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Room } from './room.entity';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class RoomService {
  private readonly JWT_SECRET = 'your-secret-key-change-in-production';

  constructor(
    @InjectRepository(Room)
    private roomRepository: Repository<Room>,
  ) {}

  async createRoom(name: string, creator: string): Promise<{ roomId: string; token: string }> {
    const room = this.roomRepository.create({ name, creator, locked: false });
    await this.roomRepository.save(room);
    const token = this.generateToken(room.id, creator);
    return { roomId: room.id, token };
  }

  async joinRoom(roomId: string, username: string): Promise<{ roomId: string; token: string; exists: boolean; locked: boolean; creator: string }> {
    const room = await this.roomRepository.findOne({ where: { id: roomId } });
    if (!room) {
      throw new Error('Room not found');
    }
    const token = this.generateToken(roomId, username);
    return { roomId, token, exists: true, locked: room.locked, creator: room.creator };
  }

  async getRoom(roomId: string): Promise<Room> {
    return this.roomRepository.findOne({ where: { id: roomId } });
  }

  async lockRoom(roomId: string, username: string): Promise<{ locked: boolean }> {
    const room = await this.roomRepository.findOne({ where: { id: roomId } });
    if (!room) {
      throw new Error('Room not found');
    }
    if (room.creator !== username) {
      throw new Error('Only room creator can lock the room');
    }
    room.locked = true;
    await this.roomRepository.save(room);
    return { locked: true };
  }

  async unlockRoom(roomId: string, username: string): Promise<{ locked: boolean }> {
    const room = await this.roomRepository.findOne({ where: { id: roomId } });
    if (!room) {
      throw new Error('Room not found');
    }
    if (room.creator !== username) {
      throw new Error('Only room creator can unlock the room');
    }
    room.locked = false;
    await this.roomRepository.save(room);
    return { locked: false };
  }

  private generateToken(roomId: string, username: string): string {
    return jwt.sign({ roomId, username }, this.JWT_SECRET, { expiresIn: '24h' });
  }
}
