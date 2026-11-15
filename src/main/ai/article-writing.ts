import { z } from 'zod'
import { articleCategories, type ArticleDraft, type ArticleGenerateInput } from '@shared/article-writing'
import { fail } from '../ipc/errors'
import { chatComplete, extractJson } from './client'

const draftSchema = z.object({
  title: z.string().trim().min(1).max(200).regex(/^[^\r\n]+$/),
  lead: z.string().trim().min(1).max(600),
  body: z.string().trim().min(1).max(6000),
  summary: z.string().trim().min(1).max(400),
  factChecks: z.array(z.string().trim().min(1).max(300)).max(12)
})

const angles = {
  humanities: '抓住一个人的选择、一件作品的具体细节或一条规则。说清它在当时意味着什么，并交代你的判断依据。',
  science: '从可观察的现象切入，逐步说明触发条件、作用过程和结果。遇到相关性、机制假说或尚无定论的解释，要准确交代证据到哪一步。',
  history: '从具体事件、人物决策或制度变化切入。交代事件先后、当事人的处境和可选方案，区分史料记载与后人的推断。'
}

const system = [
  '为普通读者写一篇有明确判断、能说服人的中文知识文章。全文只回答一个具体问题，题目太大时选一个有材料可讲的切口。',
  '先确定一句可以论证的判断、支撑它的具体依据，以及一项真正会影响这个判断的条件或争议。涉及解释时，说清哪一环最能解释现象；涉及评价时，给出判断标准。判断的力度以证据为准。',
  '标题写清对象和切口。导语在前两三句交代具体对象和作者的判断，把事实背景留给正文按需展开。',
  '正文让读者顺着证据走到结论。交代例子里谁做了什么、事物怎么变化，或哪一步造成了结果。用接下来的段落说明这些信息为什么支持判断，避免用时间先后或个别例子直接证明普遍因果。遇到关键反例、其他解释或适用边界时，在相关段落把它说透。',
  '写短而连贯的自然段，按内容推进，不套固定的分点结构。用具体名词和动词，少用抽象大词、排比、反问和感叹。删掉「在当今社会」「让我们一起」「值得我们深思」这类换个题目也能用的句子。结尾交代最后一个推论、条件或仍待回答的问题。',
  '正文约 500–800 字，论证完整就收尾。发布摘要约 40–80 字，写出一个具体发现及其缘由。所有字段用纯文本，不用 Markdown 或链接。',
  '只使用有把握的事实。严禁虚构场景、经历、数据、引语、文献和出处，严禁声称已查证。遇到证据不足的核心说法，缩小判断范围并说明原因。把需要核查的年代、数字、史实、引语或研究结论写进 factChecks，每条指出要核对的具体说法。没有此类断言时返回空数组。',
  '交稿前自行审读一次：导语能否看出立场，正文能否找到对应证据，下一段是否推进了推理。改掉重复、空话和断裂处。',
  '只返回 JSON 对象，字段为 title、lead、body、summary、factChecks。前四项是字符串，factChecks 是字符串数组。推理提纲和审稿过程留在内部。'
].join('\n')

export async function generateArticle(input: ArticleGenerateInput, brief?: string): Promise<ArticleDraft> {
  const user = [
    `类别：${articleCategories[input.category]}。${angles[input.category]}`,
    input.topic ? `题目：${JSON.stringify(input.topic)}。如果题目自带判断，检验它的依据和成立条件。` : '自行选择一个该类别下有具体材料、能给出明确判断的题目。',
    brief
  ].filter(Boolean).join('\n')
  const raw = await chatComplete([{ role: 'system', content: system }, { role: 'user', content: user }])
  const result = draftSchema.safeParse(extractJson(raw))
  if (!result.success) fail('AI_BAD_SHAPE', 'AI 返回的稿件格式不完整，请重试。')
  return result.data
}
