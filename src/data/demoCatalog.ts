import type { Drama, Episode, SubtitleCue, Topic } from '../types/drama';

function makeSvgPoster(title: string, category: string, color: string = '#F59E0B'): string {
  return (
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" width="300" height="400">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#1E2330"/>
          <stop offset="60%" stop-color="#14161D"/>
          <stop offset="100%" stop-color="#0B0C10"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg)"/>
      <circle cx="150" cy="140" r="46" fill="${color}" opacity="0.15"/>
      <polygon points="144,124 164,140 144,156" fill="${color}"/>
      <text x="150" y="230" fill="#FFFFFF" font-size="18" font-family="system-ui, sans-serif" font-weight="bold" text-anchor="middle">${title}</text>
      <rect x="110" y="250" width="80" height="22" rx="11" fill="rgba(255,255,255,0.08)"/>
      <text x="150" y="265" fill="${color}" font-size="11" font-family="system-ui, sans-serif" font-weight="600" text-anchor="middle">${category}</text>
    </svg>
  `)
  );
}

function buildSubtitles(lines: string[], duration: number): SubtitleCue[] {
  const step = duration / lines.length;
  return lines.map((text, index) => ({
    start: Math.floor(index * step),
    end: Math.ceil((index + 1) * step),
    text,
  }));
}

function generateEpisodes(
  count: number,
  titlePrefix: string,
  posterUrl: string,
  dialogues: string[][]
): Episode[] {
  return Array.from({ length: count }, (_, idx) => {
    const epNum = idx + 1;
    const duration = 80 + ((idx * 7) % 30);
    const lines = dialogues[idx % dialogues.length];
    return {
      number: epNum,
      title: `${titlePrefix} · 第 ${epNum} 集`,
      hook: lines[0] || `高能反转：第 ${epNum} 集精彩不断`,
      durationSeconds: duration,
      posterUrl,
      storyboardImages: [posterUrl],
      subtitles: buildSubtitles(lines, duration),
      qualities: [
        { label: '自动', value: 'auto' },
        { label: '1080P 超清', value: '1080p', bitrateKbps: 3600 },
        { label: '720P 高清', value: '720p', bitrateKbps: 1800 },
        { label: '480P 流畅', value: '480p', bitrateKbps: 900 },
      ],
    };
  });
}

const poster1 = makeSvgPoster('神瞳觉醒', '短剧', '#F59E0B');
const poster2 = makeSvgPoster('时停手表', '漫剧', '#38BDF8');
const poster3 = makeSvgPoster('女友帮我操闺蜜', '短剧', '#EC4899');
const poster4 = makeSvgPoster('少妇白洁', '短剧', '#A855F7');
const poster5 = makeSvgPoster('失踪的飞机杯', 'AI魔改', '#10B981');
const poster6 = makeSvgPoster('母子同欢', 'AI换脸', '#F43F5E');

export const DEMO_DRAMAS: Drama[] = [
  {
    id: '1',
    title: '神瞳觉醒',
    tagline: '穷小子意外获得透视神瞳，从此逆风翻盘鉴宝打脸全场',
    category: '短剧',
    genres: ['都市', '逆袭', '奇幻'],
    posterUrl: poster1,
    heroUrl: poster1,
    status: '连载中',
    totalEpisodes: 30,
    updatedEpisodes: 25,
    heatScore: 9850,
    playCountLabel: '1,420万',
    likesBase: 95400,
    releaseYear: '2026',
    studio: '黄果AI短剧工坊',
    synopsis:
      '平凡青年陈默意外觉醒透视神瞳，不仅能看穿原石宝玉的内在玄机，更能窥破人心虚妄。在古玩界与商战风云中，他一步步逆袭打脸豪门纨绔，成就无上商业帝国。',
    topicIds: ['topic-1', 'topic-2'],
    isFeatured: true,
    isNew: true,
    episodes: generateEpisodes(30, '神瞳觉醒', poster1, [
      [
        '陈默：这块原石外表粗糙，但内蕴帝王绿翡翠！',
        '老板：小子别吹牛，你要是看准了这块白送你！',
        '陈默：那就一言为定，当场切石！',
      ],
      [
        '师傅：出绿了！真的是极品老坑玻璃种！',
        '众人：天哪，竟然真的一刀暴富！',
        '陈默：这仅仅是个开始。',
      ],
      [
        '柳如烟：陈先生，能否帮我们柳氏鉴别这幅古画？',
        '陈默：这幅画表面是伪作，但底下藏着真迹《千里江山图》残卷！',
        '柳如烟：你到底是什么人？',
      ],
    ]),
  },
  {
    id: '2',
    title: '时停手表',
    tagline: '神秘旧表每次按下暂停整个世界，唯有他能自由行动',
    category: '漫剧',
    genres: ['奇幻', '都市', '系统'],
    posterUrl: poster2,
    heroUrl: poster2,
    status: '连载中',
    totalEpisodes: 25,
    updatedEpisodes: 20,
    heatScore: 9420,
    playCountLabel: '980万',
    likesBase: 68200,
    releaseYear: '2026',
    studio: '黄果漫剧社',
    synopsis:
      '在爷爷遗留的旧手表里，林飞发现了能够使周围时空静止五分钟的神秘力量。面对突如其来的银行大案和跨国阴谋，他利用时间静止逆转局势。',
    topicIds: ['topic-1'],
    isFeatured: true,
    isNew: false,
    episodes: generateEpisodes(25, '时停手表', poster2, [
      [
        '滴答——秒针停止了跳动，飘落的雨滴悬停在半空。',
        '林飞：时间……真的停下来了？',
        '周围行人宛如雕塑，唯独林飞可以行动自如。',
      ],
      [
        '倒计时还有两分钟，必须立刻把证据转移！',
        '林飞迅速越过静止的守卫，拿到了机密硬盘。',
        '时间恢复流动，全场惊呼！',
      ],
    ]),
  },
  {
    id: '3',
    title: '女友帮我操闺蜜',
    tagline: '都市情感错综复杂，爱恨纠葛背后的心动博弈',
    category: '短剧',
    genres: ['都市', '职场', '恋爱'],
    posterUrl: poster3,
    heroUrl: poster3,
    status: '已完结',
    totalEpisodes: 35,
    updatedEpisodes: 35,
    heatScore: 9280,
    playCountLabel: '1,150万',
    likesBase: 84300,
    releaseYear: '2026',
    studio: '都市星光',
    synopsis:
      '职场新秀李明在女友与她神秘高冷闺蜜之间的复杂互动中，意外揭开了闺蜜家族企业的惊天危机与真挚情感。',
    topicIds: ['topic-2'],
    isFeatured: false,
    isNew: true,
    episodes: generateEpisodes(35, '心动抉择', poster3, [
      [
        '苏晴：今晚的商业晚宴，你替我陪她去。',
        '李明：为什么是我？她平时对我那么冷淡。',
        '苏晴：因为只有你，我才真正信得过。',
      ],
      [
        '晚宴上，灯影摇曳，她轻轻拉住了李明的手。',
        '林薇：今晚别走，帮我演完这出戏。',
        '李明：苏晴要是知道……',
      ],
    ]),
  },
  {
    id: '4',
    title: '少妇白洁',
    tagline: '高洁典雅的都市教师，面对风雨考验守护真情',
    category: '短剧',
    genres: ['都市', '现代', '悬疑'],
    posterUrl: poster4,
    heroUrl: poster4,
    status: '连载中',
    totalEpisodes: 28,
    updatedEpisodes: 22,
    heatScore: 9160,
    playCountLabel: '890万',
    likesBase: 61500,
    releaseYear: '2026',
    studio: '原风映画',
    synopsis:
      '身处平静校园的白洁老师，偶然卷入了丈夫所在公司的利益漩涡。在重重迷局中，她凭借智慧与坚韧探寻真相，捍卫家庭与自我。',
    topicIds: ['topic-2'],
    isFeatured: false,
    isNew: false,
    episodes: generateEpisodes(28, '迷雾追寻', poster4, [
      [
        '窗外的夜雨敲打着玻璃，桌上的神秘信封没有署名。',
        '白洁拆开信封，里面赫然是三年前的合同复印件。',
        '难道当年的意外，根本不是巧合？',
      ],
    ]),
  },
  {
    id: '5',
    title: '失踪的飞机杯',
    tagline: '爆笑反转的寻物奇案，邻里之间的啼笑皆非',
    category: 'AI魔改',
    genres: ['都市', '悬疑'],
    posterUrl: poster5,
    heroUrl: poster5,
    status: '已完结',
    totalEpisodes: 18,
    updatedEpisodes: 18,
    heatScore: 8940,
    playCountLabel: '760万',
    likesBase: 52000,
    releaseYear: '2026',
    studio: '魔改实验室',
    synopsis:
      '一件网购包裹神秘失踪引发的公寓大搜查，小人物的喜怒哀乐与令人喷饭的戏剧反转轮番上演。',
    topicIds: ['topic-1'],
    isFeatured: false,
    isNew: false,
    episodes: generateEpisodes(18, '公寓奇案', poster5, [
      [
        '快递员：我发誓包裹绝对放在302门口了！',
        '张伟：那我的宝贝怎么不翼而飞了？',
        '对门的阿姨突然打开了门……',
      ],
    ]),
  },
  {
    id: '6',
    title: '母子同欢',
    tagline: '温馨感人的亲情救赎，两代人携手创业逆袭人生',
    category: 'AI换脸',
    genres: ['都市', '现代'],
    posterUrl: poster6,
    heroUrl: poster6,
    status: '已完结',
    totalEpisodes: 24,
    updatedEpisodes: 24,
    heatScore: 8870,
    playCountLabel: '690万',
    likesBase: 49800,
    releaseYear: '2026',
    studio: '温情视界',
    synopsis:
      '母亲独力抚养儿子成人，儿子大学毕业后放弃大城市高薪，回到家乡与母亲共同将传统手艺打造成全国知名品牌。',
    topicIds: ['topic-2'],
    isFeatured: false,
    isNew: false,
    episodes: generateEpisodes(24, '创业之路', poster6, [
      [
        '母亲：孩子，大城市机会多，不用为了我留下来。',
        '儿子：妈，咱们的手艺全国独一份，咱们一起做大！',
        '第一批订单在网店上线，瞬间被抢购一空。',
      ],
    ]),
  },
];

export const DEMO_TOPICS: Topic[] = [
  {
    id: 'topic-1',
    title: '奇幻高能反转短剧',
    subtitle: '每集90秒，反转不断，全程高能停不下来',
    coverUrl: poster1,
    dramaIds: ['1', '2', '5'],
    accentNote: '精选 3 部 · 必看榜',
  },
  {
    id: 'topic-2',
    title: '都市情感与职场逆袭',
    subtitle: '真实细腻的都市人生，逆境崛起的大快人心',
    coverUrl: poster3,
    dramaIds: ['1', '3', '4', '6'],
    accentNote: '精选 4 部 · 口碑推荐',
  },
];

export const HOT_SEARCH_TERMS: string[] = [
  '神瞳觉醒',
  '女友帮我操闺蜜',
  '少妇白洁',
  '短剧',
  '漫剧',
  '都市',
  '古风',
  '时停手表',
  '失踪的飞机杯',
  '母子同欢',
  '逆袭',
];
