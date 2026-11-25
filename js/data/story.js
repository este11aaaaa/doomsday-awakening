/**
 * data/story.js — 原创剧情脚本（爽文 / 短剧节奏）
 * 每行：who 说话人，type 样式（hero/enemy/sys/narr/radio），text 内容
 * 全部内容原创，未引用任何现有作品。
 */

export const STORY = {
  /** 开场：被抛弃的人 */
  opening: [
    { who: '旁白', type: 'narr', text: '2035 年，病毒吞掉了整座城市。天是灰的，风里是铁锈和腐肉的味道。' },
    { who: '旁白', type: 'narr', text: '我，林夜，一个连枪都握不稳的普通幸存者，跟着队伍钻进这间废弃超市——只为几箱压缩饼干。' },
    { who: '陈锋', type: 'enemy', text: '货都在最里面。林夜，你走前面，探路。' },
    { who: '林夜', type: 'hero', text: '……行。反正我这条命，本来也不值钱。' },
    { who: '旁白', type: 'narr', text: '尸潮来得毫无征兆。货架成排倒下，玻璃炸开，惨叫声被嘶吼淹没。' },
    { who: '陈锋', type: 'enemy', text: '门！把安全门关上！快！' },
    { who: '林夜', type: 'hero', text: '陈锋！我还在里面！！' },
    { who: '陈锋', type: 'enemy', text: '别怪我，末世里只能牺牲弱者。' },
    { who: '旁白', type: 'narr', text: '安全门在眼前合拢。最后一道缝隙里，是陈锋拖着最后一箱物资转身离开的背影。' },
    { who: '林夜', type: 'hero', text: '如果我能活下来……你们一个都跑不了。' },
    { who: '旁白', type: 'narr', text: '丧尸扑上来的那一刻，我的视野里浮起一行荧光绿的字。' },
    { who: '系统', type: 'sys', text: '【末日生存系统已激活】' },
    { who: '系统', type: 'sys', text: '【检测到宿主生命体征异常……强制绑定中】' },
    { who: '系统', type: 'sys', text: '【新手任务：击杀 20 只丧尸】' },
    { who: '系统', type: 'sys', text: '【完成奖励：战斗成长能力】' },
    { who: '林夜', type: 'hero', text: '系统？……行啊。那就先从这里，杀出去。' }
  ],

  /** 中段：绝境反击（第一阶段完成后） */
  mid: [
    { who: '系统', type: 'sys', text: '【恭喜宿主完成首次击杀】' },
    { who: '系统', type: 'sys', text: '【经验结算：+100 EXP　当前等级：2】' },
    { who: '系统', type: 'sys', text: '【提示：每升一级可进行一次进化选择】' },
    { who: '林夜', type: 'hero', text: '原来……杀得越多，我就越强。' },
    { who: '林夜', type: 'hero', text: '陈锋，你最好祈祷，别让我活着走出去。' },
    { who: '系统', type: 'sys', text: '【警告：远处检测到大量生命信号接近】' }
  ],

  /** Boss 登场 */
  boss: [
    { who: '系统', type: 'sys', text: '【警告：检测到高危变异生命体】' },
    { who: '系统', type: 'sys', text: '【威胁等级：S　建议立即撤离】' },
    { who: '旁白', type: 'narr', text: '天花板被撕开。一个由肌肉、骨刺和腐肉拼成的巨物，缓缓低下头。' },
    { who: '林夜', type: 'hero', text: '想让我逃？先问问我的枪答不答应。' }
  ],

  /** 结尾：胜利 */
  victory: [
    { who: '旁白', type: 'narr', text: '变异体倒下时，整座超市都在震。灰尘落了我一身。' },
    { who: '系统', type: 'sys', text: '【第一章任务完成 · 生存评级：S】' },
    { who: '旁白', type: 'narr', text: '在收银台后面，我找到一台还能用的无线电。' },
    { who: '无线电', type: 'radio', text: '沙……沙……有人吗？超市方向，还有活人吗？' },
    { who: '林夜', type: 'hero', text: '我是林夜。' },
    { who: '陈锋', type: 'radio', text: '林夜？你居然还活着？' },
    { who: '林夜', type: 'hero', text: '陈锋，游戏才刚刚开始。' },
    { who: '系统', type: 'sys', text: '【第一章：超市突围 已完成】' },
    { who: '系统', type: 'sys', text: '【第二章：复仇的开始 即将解锁】' }
  ]
};

/** 失败时随机播放的短句（显示在结算界面） */
export const DEFEAT_LINES = [
  '系统提示：【宿主生命体征归零……重启中】',
  '系统提示：【检测到强烈执念，是否再战一次？】',
  '丧尸撕碎了防线。但故事，还没结束。'
];
