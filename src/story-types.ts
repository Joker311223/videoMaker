export type StoryImage = { id: string; file: string; name: string };
export type StoryShot = {
  id: string;
  title: string;
  description: string;
  images: StoryImage[];
};
export type StoryChapter = {
  id: string;
  title: string;
  summary: string;
  shots: StoryShot[];
};
export type Story = {
  id: string;
  title: string;
  description: string;
  characterIds: string[];
  chapters: StoryChapter[];
  createdAt: string;
  updatedAt: string;
  revision: number;
};
