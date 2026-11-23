import heroNeonChronicle from '../assets/images/hero_neon_chronicle_1795362264327.jpg';
import posterAiComicStar from '../assets/images/poster_ai_comic_star_1795362263887.jpg';
import posterChangAnMist from '../assets/images/poster_chang_an_mist_1795362265177.jpg';
import posterCityChef from '../assets/images/poster_city_chef_1795362264379.jpg';
import posterCloudDetective from '../assets/images/poster_cloud_detective_1795362264003.jpg';
import posterInkSword from '../assets/images/poster_ink_sword_1795362264198.jpg';
import posterTimeFold from '../assets/images/poster_time_fold_1795362265185.jpg';
import type { Drama, Episode, SubtitleCue, Topic } from '../types/drama';

interface EpisodeTemplate {
  titles: string[];
  hooks: string[];
  dialoguePool: string[][];
  storyboardImages: string[];
  posterUrl: string;
}

function buildSubtitles(lines: string[], duration: number): SubtitleCue[] {
  const step = duration / lines.length;
  return lines.map((text, index) => ({
    start: Math.floor(index * step),
    end: Math.ceil((index + 1) * step),
    text,
  }));
}

function generateEpisodes(count: number, template: EpisodeTemplate): Episode[] {
  return Array.from({ length: count }, (_, idx) => {
    const epNum = idx + 1;
    const duration = 72 + ((idx * 11) % 36); // 72s - 107s typical short drama pacing
    const titleBase = template.titles[idx % template.titles.length];
    const title =
      idx < template.titles.length
        ? titleBase
        : `${titleBase} · 续章 ${epNum}`;
    const hook = template.hooks[idx % template.hooks.length];
    const lines = template.dialoguePool[idx % template.dialoguePool.length];

    return {
      number: epNum,
      title,
      hook,
      durationSeconds: duration,
      posterUrl: template.posterUrl,
      storyboardImages: template.storyboardImages,
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

export const DEMO_DRAMAS: Drama[] = [
  {
    id: 'time-fold-2049',
    title: '时序折叠：2049',
    tagline: '雨夜天台的一张城市蓝图，让建筑师提前看见七天后的危机',
    category: '短剧',
    genres: ['都市', '悬疑', '科幻'],
    posterUrl: posterTimeFold,
    heroUrl: heroNeonChronicle,
    status: '连载中',
    totalEpisodes: 36,
    updatedEpisodes: 28,
    heatScore: 9840,
    playCountLabel: '1,248万',
    likesBase: 86400,
    releaseYear: '2026',
    studio: '黄果视觉工坊',
    synopsis:
      '年轻的城市建筑师林深在梅雨夜发现一份能够映射未来七天城市交通与能源脉动的全息蓝图。为了阻止中枢塔停电事故，他必须在每一次时间折叠的九十秒窗口内找到幕后篡改算法的人。',
    topicIds: ['topic-ai-flagship', 'topic-midnight-suspense'],
    isFeatured: true,
    isNew: true,
    episodes: generateEpisodes(28, {
      posterUrl: posterTimeFold,
      storyboardImages: [posterTimeFold, heroNeonChronicle, posterCloudDetective],
      titles: [
        '雨夜的第七张蓝图',
        '九十秒折叠窗口',
        '天台上的观测者',
        '被抹除的供电回路',
        '镜面钟楼的倒计时',
        '匿名终端发来的坐标',
      ],
      hooks: [
        '玻璃幕墙外的时间忽然静止，只有蓝图上的线路仍在流动。',
        '如果七天后整座新港陷入停摆，现在改写图纸还来得及吗？',
        '对手不仅熟悉他的建筑逻辑，还提前一步锁死了电梯权限。',
      ],
      dialoguePool: [
        [
          '林深：这座楼的承重曲线不对，三分钟前数据刚刚被改写过。',
          '陈岚：别碰那张图，那是下周五凌晨三点的真实城市负载。',
          '林深：也就是说，我们还有七天，但每次校准只有九十秒。',
          '陈岚：雨停之前，带我上三十六层天台，有人在那里等我们。',
          '系统提示：时序折叠即将关闭，请立刻确认主控节点坐标。',
        ],
        [
          '陈岚：你注意到了吗？整条高架的车流在同一秒钟停顿了。',
          '林深：不是停顿，是备用电网的切换脉冲提前泄露了。',
          '神秘来电：林建筑师，你看到的只是冰山一角，翻到蓝图背面。',
          '林深：背面有一串十年前的老城变电站编号……',
          '陈岚：快走，安保系统已经被远程重置，我们只剩二十秒。',
        ],
      ],
    }),
  },
  {
    id: 'chang-an-mist',
    title: '长安秘录：画中局',
    tagline: '一盏秋夜古亭灯火，牵出十年前失落的宫廷画卷奇案',
    category: '短剧',
    genres: ['古风', '悬疑'],
    posterUrl: posterChangAnMist,
    heroUrl: posterChangAnMist,
    status: '已完结',
    totalEpisodes: 30,
    updatedEpisodes: 30,
    heatScore: 9510,
    playCountLabel: '986万',
    likesBase: 71200,
    releaseYear: '2026',
    studio: '云阁原创剧社',
    synopsis:
      '秋雾笼罩长安西市，修复古画的画师沈微受托辨认一幅残缺《百灯夜宴图》，却在颜料夹层中发现失踪多年的官银账册线索。步步惊心的灯影之下，每翻开一页画卷都暗藏反转。',
    topicIds: ['topic-midnight-suspense', 'topic-eastern-aesthetics'],
    isNew: true,
    episodes: generateEpisodes(30, {
      posterUrl: posterChangAnMist,
      storyboardImages: [posterChangAnMist, posterInkSword],
      titles: [
        '秋雾百灯夜宴图',
        '朱砂夹层里的印鉴',
        '雨落石阶无足迹',
        '旧茶楼的三声梆子',
        '真假画师对质公堂',
        '残卷拼合见真章',
      ],
      hooks: [
        '灯笼照亮石阶的那一刻，画里多出来的一道人影动了。',
        '这幅画用过西域松烟墨，绝非寻常市井临摹之作。',
        '三更鼓响，阁楼里只留下一枚温热的青铜印章。',
      ],
      dialoguePool: [
        [
          '沈微：大人请看，这处灯火的落笔比原画晚了整整十年。',
          '陆昭：有人借修画之名，把真正的账目藏进了石青颜料底下。',
          '沈微：而且送画来的人，鞋底沾着城南枫林独有的红泥。',
          '陆昭：今夜雾重，随我去枫亭走一趟，看谁先按捺不住。',
          '画卷轻展，石阶尽头忽然亮起一盏无人提着的绢灯。',
        ],
        [
          '陆昭：阁楼四面封窗，刺客不可能凭空消失。',
          '沈微：他没有离开，你看那扇屏风上的山水折痕。',
          '沈微：画中暗格连通回廊，这才是整座宅院真正的机关。',
          '陆昭：传令封锁西市坊门，今夜必须水落石出。',
        ],
      ],
    }),
  },
  {
    id: 'star-dome-mecha',
    title: '星穹机甲纪元',
    tagline: '云海轨道城突发引力失衡，见习领航员启动尘封十年的银翼机甲',
    category: '漫剧',
    genres: ['奇幻', '科幻', '机甲'],
    posterUrl: posterAiComicStar,
    heroUrl: posterAiComicStar,
    status: '连载中',
    totalEpisodes: 40,
    updatedEpisodes: 32,
    heatScore: 9320,
    playCountLabel: '874万',
    likesBase: 64900,
    releaseYear: '2026',
    studio: '星弧漫剧社',
    synopsis:
      '公元 2180 年，漂浮在平流层之上的星环都市遭遇太阳风暴冲击。年轻领航员苏澈在天桥观测站截获一段来自旧纪元卫星的求救信号，与搭档一同驾驶实验型银翼机甲守卫天际线。',
    topicIds: ['topic-ai-flagship', 'topic-comic-universe'],
    isNew: true,
    episodes: generateEpisodes(32, {
      posterUrl: posterAiComicStar,
      storyboardImages: [posterAiComicStar, heroNeonChronicle],
      titles: [
        '落日云海上的星环',
        '零号天桥的紧急信号',
        '银翼核心重新点火',
        '平流层磁暴突围',
        '轨道锚点同步协议',
        '越过云巅的微光',
      ],
      hooks: [
        '日落前的三分钟，整座云海轨道城的护盾读数骤降。',
        '只有十年前的旧式手动操纵杆，能绕开被干扰的自动导航。',
        '机甲面罩亮起琥珀色航线，前方是最后一道跃迁窗口。',
      ],
      dialoguePool: [
        [
          '苏澈：云层下方电磁干扰太强，外环三号锚点正在下沉。',
          '塔台指挥：常规无人机全部失联，只能启用人工近轨校准。',
          '苏澈：把银翼实验机的神经同步权限交给我，现在就出发。',
          '机甲语音：引擎预热完成，外部气压稳定，祝你航行顺利。',
          '苏澈：守住这座城市，我们绝不退后半步。',
        ],
        [
          '副官：星环东侧还有两艘民用穿梭艇没来得及入港！',
          '苏澈：收到，我用推进器替他们打开一条气流畅通走廊。',
          '塔台指挥：注意燃料余量，风暴峰值将在四十秒后到达。',
          '苏澈：四十秒足够了，全员抓紧，准备冲出云墙！',
        ],
      ],
    }),
  },
  {
    id: 'midnight-noodle-station',
    title: '深夜食堂·第七号站台',
    tagline: '老巷尽头只在零点亮灯的面馆，用一碗热汤接住归途中的故事',
    category: '短剧',
    genres: ['都市', '职场', '逆袭'],
    posterUrl: posterCityChef,
    heroUrl: posterCityChef,
    status: '已完结',
    totalEpisodes: 24,
    updatedEpisodes: 24,
    heatScore: 8960,
    playCountLabel: '742万',
    likesBase: 58300,
    releaseYear: '2026',
    studio: '晴岚剧制',
    synopsis:
      '每逢深夜末班地铁停靠第七号站台，雨巷拐角的木门面馆便会升起热气。沉默寡言的老板阿诚记住了每一位常客的口味与心事，在短短两分钟一集的人间烟火里，见证城市夜归人的重启时刻。',
    topicIds: ['topic-urban-healing'],
    episodes: generateEpisodes(24, {
      posterUrl: posterCityChef,
      storyboardImages: [posterCityChef, posterTimeFold],
      titles: [
        '末班车后的葱油拌面',
        '雨伞与两枚硬币',
        '面试失败的那个夜晚',
        '外婆手抄的汤底配方',
        '搬家前的最后一碗热汤',
        '天亮之前的新起点',
      ],
      hooks: [
        '推开木门那一瞬间，外面的大雨好像突然安静了下来。',
        '老板没多问一句话，只是多加了一勺刚熬好的鸡汤。',
        '留在吧台上的便利贴，写着三年前同样的愿望。',
      ],
      dialoguePool: [
        [
          '食客：老板，这么晚还开着门吗？随便来一碗热的就好。',
          '阿诚：坐吧，今天刚吊好的清汤，加一份嫩笋和溏心蛋。',
          '食客：项目做了半年还是被叫停了，突然不知道明天该去哪。',
          '阿诚：先吃面，热汤下肚，天亮了再想明天的路。',
          '暖黄的灯光映在雨后的青石板上，又一位夜归人推门而入。',
        ],
        [
          '阿诚：这碗面不加香菜，多放一点白胡椒，对吧？',
          '老顾客：没想到隔了两年回来，你还记得我的习惯。',
          '阿诚：只要你还记得这条巷子，这盏灯就会一直亮着。',
          '蒸汽漫过木质吧台，窗外远处的早班列车缓缓驶过。',
        ],
      ],
    }),
  },
  {
    id: 'witness-zero',
    title: '零号证人',
    tagline: '百叶窗光影交错的深夜书房，一枚停在十二点的机械表重启悬案',
    category: 'AI换脸',
    genres: ['都市', '悬疑'],
    posterUrl: posterCloudDetective,
    heroUrl: posterCloudDetective,
    status: '连载中',
    totalEpisodes: 32,
    updatedEpisodes: 26,
    heatScore: 9180,
    playCountLabel: '815万',
    likesBase: 61400,
    releaseYear: '2026',
    studio: '黄果视觉工坊',
    synopsis:
      '资深刑侦顾问顾明在整理旧档案时，发现一宗尘封五年的商业失窃案现场蓝图与当下发生的离奇事件完全吻合。唯一的目击者从未现身，只在每起事件后寄来一枚调慢三分钟的机械表。',
    topicIds: ['topic-midnight-suspense', 'topic-ai-flagship'],
    isNew: true,
    episodes: generateEpisodes(26, {
      posterUrl: posterCloudDetective,
      storyboardImages: [posterCloudDetective, heroNeonChronicle],
      titles: [
        '慢了三分钟的机械表',
        '百叶窗外的蓝色车影',
        '档案室缺失的第七页',
        '录音带里的地铁报站声',
        '双面设计图的破绽',
        '零号证人终于现身',
      ],
      hooks: [
        '表盘背面的刻字在台灯下显现，竟是一组档案馆柜号。',
        '所有人的不在场证明都天衣无缝，唯独时间差了整整三分钟。',
        '电话那头没有说话，只有背景里清晰的雨声与钟摆声。',
      ],
      dialoguePool: [
        [
          '顾明：这块表的游丝被人故意动过，每小时刚好慢三十秒。',
          '助手：也就是说，监控拍到他离开大厦的时间，其实是伪造的？',
          '顾明：不，监控是真的，错的是大厅主时钟的校时信号。',
          '顾明：把五年前那份建筑图纸拿过来，答案就在通风管道里。',
        ],
        [
          '助手：顾队，匿名寄件人又寄来了一段十二秒的音频。',
          '顾明：把降噪调到最高，听背景里的风铃和电车声。',
          '顾明：全城只有南岸老码头还有这种有轨电车，马上出发。',
        ],
      ],
    }),
  },
  {
    id: 'shan-hai-qingluan',
    title: '山海绘卷：青鸾',
    tagline: '水墨云海间金羽掠过，少年绘师踏入活过来的上古山海画境',
    category: 'AI魔改',
    genres: ['古风', '仙侠', '武侠'],
    posterUrl: posterInkSword,
    heroUrl: posterInkSword,
    status: '连载中',
    totalEpisodes: 36,
    updatedEpisodes: 30,
    heatScore: 9430,
    playCountLabel: '928万',
    likesBase: 77500,
    releaseYear: '2026',
    studio: '丹青漫剧工坊',
    synopsis:
      '以新中式青绿山水与金箔工笔打造的高燃国风 AI 漫剧。隐居山谷的少年画师白珩无意间唤醒古卷中的金羽青鸾，为修复濒临崩解的四方灵脉，开启一段跨越奇峰云海的奇幻冒险。',
    topicIds: ['topic-comic-universe', 'topic-eastern-aesthetics'],
    isNew: true,
    episodes: generateEpisodes(30, {
      posterUrl: posterInkSword,
      storyboardImages: [posterInkSword, posterChangAnMist],
      titles: [
        '青绿峰顶初见青鸾',
        '墨池泛起金色涟漪',
        '云海古亭的守卷人',
        '借一笔朱砂定风波',
        '断桥重绘山河阵',
        '破晓时分千峰齐鸣',
      ],
      hooks: [
        '晨光刺破云层，画纸上的金羽竟化作流光冲出窗外。',
        '这卷山海图并非死物，每一笔落墨都在改写山谷地势。',
        '灵脉断流之处，唯有以心为笔方能续写古卷。',
      ],
      dialoguePool: [
        [
          '白珩：画卷边缘的山峰竟然真的在云雾里显现了！',
          '青鸾：执笔之人，四方灵脉已失其三，随我登临望云亭。',
          '白珩：我只是个山野画师，真能补全上古山海卷吗？',
          '青鸾：心无杂念，笔下自有山河，落墨吧！',
        ],
        [
          '守卷人：若想渡过断云涧，必须先找到失落的石青矿脉。',
          '白珩：你看朝阳映在水面上的反光，矿脉就在亭下岩壁里。',
          '金光掠过江面，整幅青绿长卷在晨曦中轰然舒展。',
        ],
      ],
    }),
  },
];

export const DEMO_TOPICS: Topic[] = [
  {
    id: 'topic-ai-flagship',
    title: 'AI 科幻与高概念短剧精选',
    subtitle: '以电影级光影重构近未来都市与高能反转，每集 90 秒全程高密节奏',
    coverUrl: heroNeonChronicle,
    dramaIds: ['time-fold-2049', 'star-dome-mecha', 'witness-zero'],
    accentNote: '精选 3 部 · 高清流畅',
  },
  {
    id: 'topic-eastern-aesthetics',
    title: '东方美学：古风悬疑与国风漫剧',
    subtitle: '从长安秋夜灯影到青绿山水长卷，沉浸式领略中式视觉叙事',
    coverUrl: posterInkSword,
    dramaIds: ['chang-an-mist', 'shan-hai-qingluan'],
    accentNote: '精选 2 部 · 口碑必看',
  },
  {
    id: 'topic-midnight-suspense',
    title: '深夜烧脑悬疑剧场',
    subtitle: '步步反转、草蛇灰线，适合睡前一口气连刷十集的悬疑佳作',
    coverUrl: posterCloudDetective,
    dramaIds: ['witness-zero', 'chang-an-mist', 'time-fold-2049'],
    accentNote: '精选 3 部 · 连刷推荐',
  },
  {
    id: 'topic-urban-healing',
    title: '都市微光与治愈日常',
    subtitle: '在快节奏的城市缝隙里，用温暖烟火气点亮每一个夜归时刻',
    coverUrl: posterCityChef,
    dramaIds: ['midnight-noodle-station', 'time-fold-2049'],
    accentNote: '精选 2 部 · 高分治愈',
  },
];

export const HOT_SEARCH_TERMS: string[] = [
  '时序折叠',
  '长安秘录',
  '漫剧',
  '星穹机甲',
  '山海绘卷',
  '深夜食堂',
  '零号证人',
  '悬疑反转',
];
