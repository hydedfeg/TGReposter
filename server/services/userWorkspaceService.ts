import userWorkspaceRepository from "../repositories/userWorkspaceRepository";
import {
  ownerPrincipalForUser,
  type AuthenticatedUserIdentity,
} from "./userPrincipalService";

export async function getUserWorkspaceConfig(user: AuthenticatedUserIdentity) {
  return userWorkspaceRepository.getConfig(ownerPrincipalForUser(user));
}

export async function saveUserChannels(
  user: AuthenticatedUserIdentity,
  channels: unknown
) {
  return userWorkspaceRepository.replaceChannels(
    ownerPrincipalForUser(user),
    channels
  );
}

export async function saveUserFilters(
  user: AuthenticatedUserIdentity,
  filters: unknown
) {
  return userWorkspaceRepository.saveFilters(
    ownerPrincipalForUser(user),
    filters
  );
}

export async function saveUserAIConfig(
  user: AuthenticatedUserIdentity,
  aiConfig: unknown
) {
  return userWorkspaceRepository.saveAIConfig(
    ownerPrincipalForUser(user),
    aiConfig
  );
}

export { userWorkspaceRepository };
