import postRepository, { PostEntity } from "../repositories/postRepository";

export class PostService {
  async savePosts(ownerPrincipal: string, posts: PostEntity[]) {
    if (!posts.length) return [];

    return await postRepository.upsertMany(ownerPrincipal, posts);
  }

  async getPostsByIds(ownerPrincipal: string, ids: string[]) {
    return await postRepository.getByIds(ownerPrincipal, ids);
  }

  async getRecentPosts(ownerPrincipal: string, limit = 400) {
    return await postRepository.getRecent(ownerPrincipal, limit);
  }

  async countPosts(ownerPrincipal: string) {
    return await postRepository.count(ownerPrincipal);
  }
}

export default new PostService();
