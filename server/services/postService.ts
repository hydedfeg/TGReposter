import postRepository, { PostEntity } from "../repositories/postRepository";

export class PostService {
  async savePosts(posts: PostEntity[]) {
    if (!posts.length) return [];

    return await postRepository.upsertMany(posts);
  }

  async getRecentPosts(limit = 400) {
    return await postRepository.getRecent(limit);
  }

  async countPosts() {
    return await postRepository.count();
  }
}

export default new PostService();