import {
  ChannelRepository,
  SourceChannel,
} from "../repositories/channelRepository";

export class ChannelService {
  constructor(
    private repository = new ChannelRepository()
  ) {}

  async list() {
    return this.repository.getAll();
  }

  async add(username: string) {
    const clean = username.trim().toLowerCase();

    if (!clean) {
      throw new Error("Channel username cannot be empty.");
    }

    const existing = await this.repository.getAll();

    if (existing.some(c => c.username === clean)) {
      throw new Error("Channel already exists.");
    }

    const channel: SourceChannel = {
      username: clean,
      enabled: true,
    };

    await this.repository.create(channel);

    return channel;
  }

  async remove(username: string) {
    await this.repository.remove(
      username.trim().toLowerCase()
    );
  }
}