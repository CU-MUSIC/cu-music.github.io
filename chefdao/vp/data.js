/**
 * ChefDao VP Guide — data.js
 *
 * 维护方式：
 *   - password / volume / desc → 每月手动修改
 *   - categories               → 手动维护（增减分类）
 *   - techniques               → 手动修改，或运行 node sync-notion.js 自动从 Notion 同步
 *
 * 每首歌的 spotifyId 字段说明：
 *   从 Spotify 分享的 embed 代码中提取 track ID，例如：
 *   https://open.spotify.com/embed/track/6dOtVTDdiauQNBQEDOtlAB
 *                                              ↑ 这一段就是 spotifyId
 *   如果是网易云，link 填 163 链接，spotifyId 留空即可
 */

window.CHEFDAO_DATA = {

  /* ────────────────────────────────────────────
   * 每月修改
   * ──────────────────────────────────────────── */
  password: "DAO0526",
  volume:   "Vol.01",
  desc:     "精选人声制作技术解析——以真实歌曲为素材，拆解每一个声音背后的思维逻辑。",

  /* ────────────────────────────────────────────
   * 分类（侧边栏导航）
   *
   * id    唯一标识，与 techniques[].category 对应
   * name  显示名称
   * desc  分类介绍（显示在内容区顶部）
   * ──────────────────────────────────────────── */
  categories: [
    {
      id:   "pitch",
      name: "音调处理",
      desc: "音高修正、Auto-Tune 与人声加倍——探讨音调工具在不同创意场景下的边界与可能性。"
    },
    {
      id:   "dynamics",
      name: "动态控制",
      desc: "压缩、门控与 Pumping——让人声的动态起伏成为音乐律动本身的一部分。"
    },
    {
      id:   "space",
      name: "空间效果",
      desc: "混响、延迟与声像——构建人声的空间感与距离感，从亲密独白到史诗宽度。"
    },
    {
      id:   "riser",
      name: "Riser 系列",
      desc: "反向混响、反向 Delay 与上升张力效果——制造期待与释放感的进阶技法。"
    },
    {
      id:   "chop",
      name: "人声切片",
      desc: "Vocal Chop 的创意切割与重组——将人声素材变成旋律乐器的制作思维。"
    },
    {
      id:   "freq",
      name: "频率处理",
      desc: "EQ 雕刻与饱和失真——从透明纤细到厚重破音，频率层面的人声风格塑造。"
    }
  ],

  /* ────────────────────────────────────────────
   * 技术条目
   *
   * category  对应上方 categories[].id
   * name      技术英文名（金色标签）
   * title     技术中文名
   * desc      描述
   * songs     参考曲目数组：
   *   title      歌曲名
   *   artist     艺术家（可空）
   *   timestamp  关键时间点，例如 "0:55"、"开头"、"Hook"（可空）
   *   genre      流派（可空）
   *   spotifyId  Spotify Track ID（可空，填了才显示播放按钮和 embed）
   *   link       外链（Spotify 完整链接 或 网易云链接，可空）
   * ──────────────────────────────────────────── */
  techniques: [

    /* ── 音调处理 ── */
    {
      category: "pitch",
      name:  "Pitch Correction",
      title: "音调修正",
      desc:  "通过精准的音高修正塑造人声个性——从自然透明到刻意声学失真，关键在于修正量的拿捏与时机。",
      songs: [
        {
          title:     "Gasoline",
          artist:    "The Weeknd",
          timestamp: "0:55",
          genre:     "Pop",
          spotifyId: "",
          link:      ""
        },
        {
          title:     "I KNOW ?",
          artist:    "",
          timestamp: "1:50",
          genre:     "HipHop",
          spotifyId: "6wsqVwoiVH2kde4k4KKAFU",
          link:      "https://open.spotify.com/track/6wsqVwoiVH2kde4k4KKAFU"
        },
        {
          title:     "Humble",
          artist:    "Kendrick Lamar",
          timestamp: "开头",
          genre:     "HipHop",
          spotifyId: "7KXjTSCq5nL1LoYtL7XAwS",
          link:      "https://open.spotify.com/track/7KXjTSCq5nL1LoYtL7XAwS"
        }
      ]
    },
    {
      category: "pitch",
      name:  "Auto-Tune",
      title: "旋律风格化",
      desc:  "Auto-Tune 作为创意工具而非修复工具——探讨其在不同流派中的情绪表达功能与极致运用边界。",
      songs: [
        {
          title:     "I KNOW ?",
          artist:    "",
          timestamp: "1:50",
          genre:     "HipHop",
          spotifyId: "6wsqVwoiVH2kde4k4KKAFU",
          link:      "https://open.spotify.com/track/6wsqVwoiVH2kde4k4KKAFU"
        }
      ]
    },
    {
      category: "pitch",
      name:  "Doubling · DUP",
      title: "人声加倍增厚",
      desc:  "通过微量音高偏移和延迟实现自然的人声加宽效果，从单声道弱到立体声厚重感的过渡控制。",
      songs: [
        {
          title:     "Humble",
          artist:    "Kendrick Lamar",
          timestamp: "开头",
          genre:     "HipHop",
          spotifyId: "7KXjTSCq5nL1LoYtL7XAwS",
          link:      "https://open.spotify.com/track/7KXjTSCq5nL1LoYtL7XAwS"
        }
      ]
    },

    /* ── 动态控制 ── */
    {
      category: "dynamics",
      name:  "Gate · Pumping",
      title: "动态门控",
      desc:  "噪声门与侧链压缩创造的律动感——让人声在静音与饱满之间形成对比，构建独特的「呼吸感」。",
      songs: [
        {
          title:     "Birds of a Feather",
          artist:    "Billie Eilish",
          timestamp: "Hook",
          genre:     "Pop",
          spotifyId: "6dOtVTDdiauQNBQEDOtlAB",
          link:      "https://open.spotify.com/track/6dOtVTDdiauQNBQEDOtlAB"
        }
      ]
    },

    /* ── 空间效果 ── */
    {
      category: "space",
      name:  "Reverb",
      title: "空间与距离感",
      desc:  "混响不只是「加湿」，而是构建声音的空间叙事——近距离亲密感与遥远史诗感的控制逻辑。",
      songs: [
        {
          title:     "Birds of a Feather",
          artist:    "Billie Eilish",
          timestamp: "Hook",
          genre:     "Pop",
          spotifyId: "6dOtVTDdiauQNBQEDOtlAB",
          link:      "https://open.spotify.com/track/6dOtVTDdiauQNBQEDOtlAB"
        }
      ]
    },
    {
      category: "space",
      name:  "Delay · Suck",
      title: "抽吸感延迟",
      desc:  "特定 Delay 配置下产生的律动吸入感——在 Hip-Hop 与 R&B 人声中塑造独特的流动节奏张力。",
      songs: [
        {
          title:     "背叛 NEED<3",
          artist:    "",
          timestamp: "50s",
          genre:     "C-HipHop",
          spotifyId: "",
          link:      "https://music.163.com/#/song?id=3374011915"
        }
      ]
    },

    /* ── Riser 系列 ── */
    {
      category: "riser",
      name:  "Reverse Reverb",
      title: "反向混响",
      desc:  "将混响尾音反转置于人声之前——制造出一种向前涌动的「吸气感」，常见于副歌前的张力积累。",
      songs: [
        /* 示例：填入你的参考曲目 */
        /*
        {
          title:     "Song Title",
          artist:    "Artist",
          timestamp: "0:32",
          genre:     "Pop",
          spotifyId: "TRACK_ID_HERE",
          link:      "https://open.spotify.com/track/TRACK_ID_HERE"
        }
        */
      ]
    },
    {
      category: "riser",
      name:  "Reverse Delay",
      title: "反向延迟",
      desc:  "Delay 的反向应用——制造人声从虚空中「被拉出来」的错位感，用于构建独特的过渡时刻。",
      songs: []
    },

    /* ── 人声切片 ── */
    {
      category: "chop",
      name:  "Vocal Chop",
      title: "人声切片",
      desc:  "将人声音节切割、移调、重排——把录音室素材变成一件旋律乐器的创意制作方式。",
      songs: []
    },

    /* ── 频率处理 ── */
    {
      category: "freq",
      name:  "EQ",
      title: "频率雕刻",
      desc:  "频率均衡的核心逻辑——减法优先于加法，以及不同录音环境下的修正思路与风格塑造。",
      songs: [
        {
          title:     "自立巷",
          artist:    "",
          timestamp: "",
          genre:     "C-Pop",
          spotifyId: "",
          link:      ""
        },
        {
          title:     "Count Me Out",
          artist:    "Kendrick Lamar",
          timestamp: "",
          genre:     "HipHop",
          spotifyId: "",
          link:      "https://open.spotify.com/artist/2YZyLoL8N0Wb9xBt1NhZWg"
        },
        {
          title:     "DD Backseat",
          artist:    "",
          timestamp: "开头",
          genre:     "C-Pop",
          spotifyId: "",
          link:      "https://music.163.com/#/song?id=3362321946"
        },
        {
          title:     "骑士爱",
          artist:    "",
          timestamp: "0:40",
          genre:     "C-Pop",
          spotifyId: "",
          link:      "https://music.163.com/#/song?id=3374012929"
        }
      ]
    },
    {
      category: "freq",
      name:  "Distortion · Saturation",
      title: "饱和与失真",
      desc:  "饱和与失真如何赋予人声攻击性或温暖感——从轻微谐波增益到破音风格的全光谱应用逻辑。",
      songs: [
        {
          title:     "The Hills",
          artist:    "The Weeknd",
          timestamp: "",
          genre:     "Pop",
          spotifyId: "7fBv7CLKzipRk6EC6TWHOB",
          link:      "https://open.spotify.com/track/7fBv7CLKzipRk6EC6TWHOB"
        },
        {
          title:     "Count Me Out",
          artist:    "Kendrick Lamar",
          timestamp: "",
          genre:     "HipHop",
          spotifyId: "",
          link:      "https://open.spotify.com/artist/2YZyLoL8N0Wb9xBt1NhZWg"
        }
      ]
    }

  ]

};
