import { Plus, Sparkles } from 'lucide-react'
import { TopicCard } from './TopicCard'
import { topics, type Topic } from './topic-data'
export function TodayView({onOpenTopic}:{onOpenTopic:(t:Topic)=>void}){return <main className="today">
 <header className="hero"><div><p className="date">8 月 13 日 · 星期四</p><h1>今天，想聊点什么？</h1><p>从一个问题开始，和 AI 一起把模糊的想法慢慢想清楚。</p></div><button className="primary" onClick={()=>onOpenTopic({id:'custom',kind:'为你推荐',title:'一个还没有名字的新想法',summary:'',reason:'你创建的议题',source:'私人议题',color:'green'})}><Plus size={18}/>新建议题</button></header>
 <section aria-labelledby="daily-title"><div className="section-head"><div><span className="eyebrow"><Sparkles size={14}/>今日三题</span><h2 id="daily-title">为今天留一个值得想的问题</h2></div><button className="text-button">换一组</button></div><div className="topic-list">{topics.map(t=><TopicCard key={t.id} topic={t} onOpen={onOpenTopic}/>)}</div></section>
 <section className="continue"><div><span className="eyebrow">继续思考</span><h2>技术让生活更有效率，也让时间更自由了吗？</h2><p>上次停在：效率节省下来的时间，为什么常常又被更多任务填满？</p></div><button onClick={()=>onOpenTopic(topics[1])}>继续上次对话</button></section>
 </main>}
