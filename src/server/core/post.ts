import { reddit } from '@devvit/web/server';
import { todayString } from '../../shared/level.js';

export const createPost = async () => {
  return await reddit.submitCustomPost({
    title: `Daily Orbit · ${todayString()} — pull back, let it fly`,
  });
};
