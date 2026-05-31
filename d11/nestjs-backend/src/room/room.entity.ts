import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity()
export class Room {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  creator: string;

  @Column({ default: false })
  locked: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
