import {
  ChannelRepository,
  SourceChannel,
} from "../repositories/channelRepository";
import {
  ownerPrincipalForUser,
  type AuthenticatedUserIdentity,
} from "./userPrincipalService";

export class ChannelService {
  constructor(
    private repository = new ChannelRepository()
  ) {}

  async list(user: AuthenticatedUserIdentity) {
    return this.repository.getAll(ownerPrincipalForUser(user));
  }

  async add(user: AuthenticatedUserIdentity, username: string) {
    const ownerPrincipal = ownerPrincipalForUser(user);
    const clean = username.trim().toLowerCase();

    if (!clean) {
      throw new Error("Channel username cannot be empty.");
    }

    const existing = await this.repository.getAll(ownerPrincipal);

    if (existing.some(c => c.username === clean)) {
      throw new Error("Channel already exists.");
    }

    const channel: SourceChannel = {
      username: clean,
      enabled: true,
    };

    await this.repository.create(ownerPrincipal, channel);

    return channel;
  }

  async remove(user: AuthenticatedUserIdentity, username: string) {
    await this.repository.remove(
      ownerPrincipalForUser(user),
      username.trim().toLowerCase()
    );
  }
}
