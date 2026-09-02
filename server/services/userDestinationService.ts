import userDestinationRepository, {
  type DestinationStatusUpdate,
  type UserDestinationTarget,
} from "../repositories/userDestinationRepository";
import { isUserTelegramBotTokenConfigured } from "./telegramCredentialService";

import {
  ownerPrincipalForUser,
  type AuthenticatedUserIdentity,
} from "./userPrincipalService";

export type DestinationAuthenticatedUser = AuthenticatedUserIdentity;

// Backwards-compatible alias used by existing destination code/tests.
export const destinationOwnerPrincipalForUser = ownerPrincipalForUser;

export async function getUserDestinationConfig(
  user: DestinationAuthenticatedUser
) {
  const ownerPrincipal = destinationOwnerPrincipalForUser(user);
  const [targets, botTokenConfigured] = await Promise.all([
    userDestinationRepository.listTargets(ownerPrincipal),
    isUserTelegramBotTokenConfigured(ownerPrincipal),
  ]);

  return {
    botToken: "",
    botTokenConfigured,
    channelId: "",
    targets,
    connected: targets.some(target => target.status === "success"),
  };
}

export async function saveUserDestinationTargets(
  user: DestinationAuthenticatedUser,
  targets: unknown
) {
  const ownerPrincipal = destinationOwnerPrincipalForUser(user);
  const savedTargets = await userDestinationRepository.replaceTargets(
    ownerPrincipal,
    targets
  );
  const botTokenConfigured =
    await isUserTelegramBotTokenConfigured(ownerPrincipal);

  return {
    botToken: "",
    botTokenConfigured,
    channelId: "",
    targets: savedTargets,
    connected: savedTargets.some(target => target.status === "success"),
  };
}

export async function updateUserDestinationStatuses(
  user: DestinationAuthenticatedUser,
  updates: DestinationStatusUpdate[]
) {
  const ownerPrincipal = destinationOwnerPrincipalForUser(user);
  await userDestinationRepository.updateStatuses(ownerPrincipal, updates);
  return getUserDestinationConfig(user);
}

export type { UserDestinationTarget };
