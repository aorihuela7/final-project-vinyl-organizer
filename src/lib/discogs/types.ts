/** Shapes returned by the Discogs API (only the fields we read). */

export type DiscogsArtist = { name: string; anv?: string; join?: string; id?: number };
export type DiscogsLabel = { name: string; catno?: string };
export type DiscogsFormat = { name: string; qty?: string; descriptions?: string[]; text?: string };

export type DiscogsBasicInformation = {
  id: number;
  title: string;
  year?: number;
  artists?: DiscogsArtist[];
  labels?: DiscogsLabel[];
  genres?: string[];
  styles?: string[];
  formats?: DiscogsFormat[];
  cover_image?: string;
  thumb?: string;
};

export type DiscogsCollectionItem = {
  id: number;
  instance_id: number;
  date_added?: string;
  basic_information: DiscogsBasicInformation;
};

export type DiscogsCollectionPage = {
  pagination: { page: number; pages: number; per_page: number; items: number };
  releases: DiscogsCollectionItem[];
};

export type DiscogsSearchResult = {
  id: number;
  type?: string;
  title: string;
  year?: string;
  format?: string[];
  genre?: string[];
  style?: string[];
  label?: string[];
  cover_image?: string;
  thumb?: string;
};

export type DiscogsRelease = {
  id: number;
  title: string;
  year?: number;
  artists?: DiscogsArtist[];
  labels?: DiscogsLabel[];
  genres?: string[];
  styles?: string[];
  formats?: DiscogsFormat[];
  images?: Array<{ type: string; uri: string; uri150: string }>;
  thumb?: string;
};
