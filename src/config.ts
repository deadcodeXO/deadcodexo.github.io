export const SITE = {
  website: "https://chaos.functionabuse.net/",
  author: "DEADCODEXO",
  profile: "https://github.com/deadcodexo",
  desc: "just a below average ghost trapped inside a PC",
  title: "DEADCODEXO",
  ogImage: "",
  lightAndDarkMode: true,
  postPerIndex: 6,
  postPerPage: 8,
  scheduledPostMargin: 15 * 60 * 1000, // 15 minutes
  showProjects: true,
  showArchives: true,
  showGalleries: true,
  showBackButton: true,
  editPost: {
    enabled: false,
    text: "Edit this post",
    url: "https://github.com/deadcodeXO/deadcodexo.github.io/edit/main/",
  },
  dynamicOgImage: true,
  dir: "ltr", // "rtl" | "auto"
  lang: "en", // html lang code. Set this empty and default will be "en"
  timezone: "America/Halifax", // Default global timezone (IANA format)
  introAudio: {
    enabled: true,
    src: "/audio/aghostinthemachine.mp3",
    label: "AGHOST.MP3",
    duration: 199,
  },
} as const;
