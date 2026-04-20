export type AthleteCatalogItem = {
  id: number;
  slug: string;
  displayName: string;
  heroCopy: string;
};

export const athleteCatalog: AthleteCatalogItem[] = [
  {
    id: 1,
    slug: "demo-athlete",
    displayName: "Demo Athlete",
    heroCopy: "Fan photos become one portrait.",
  },
];
