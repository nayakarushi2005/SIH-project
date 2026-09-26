const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function ago(ms) {
  return Date.now() - ms;
}

export const DUMMY_CHATS = [
  {
    id: 'arushi',
    name: 'Arushi',
    color: '#EC4899',
    unread: 3,
    messages: [
      { id: 'a1', fromMe: true, text: 'Hi Arushi, I can come for the fan repair today.', at: ago(2 * HOUR) },
      { id: 'a2', fromMe: false, text: 'That would be great, thank you!', at: ago(90 * MINUTE) },
      { id: 'a3', fromMe: false, text: 'Will 5 pm work for you?', at: ago(20 * MINUTE) },
      { id: 'a4', fromMe: false, text: 'Please bring a spare regulator too.', at: ago(12 * MINUTE) },
    ],
  },
  {
    id: 'aryan',
    name: 'Aryan',
    color: '#6366F1',
    unread: 1,
    messages: [
      { id: 'b1', fromMe: false, text: 'Is the shifting still on for Saturday?', at: ago(5 * HOUR) },
      { id: 'b2', fromMe: true, text: 'Yes, the truck will reach by 9 am.', at: ago(4 * HOUR) },
      { id: 'b3', fromMe: false, text: 'Perfect. I will keep the boxes ready.', at: ago(45 * MINUTE) },
    ],
  },
  {
    id: 'ishwar',
    name: 'Ishwar',
    color: '#0EA5E9',
    unread: 0,
    messages: [
      { id: 'c1', fromMe: false, text: 'The sink is working fine now.', at: ago(DAY + 3 * HOUR) },
      { id: 'c2', fromMe: true, text: 'Glad to hear that. Do rate the job when you can.', at: ago(DAY + 2 * HOUR) },
    ],
  },
  {
    id: 'shreyansh',
    name: 'Shreyansh',
    color: '#F59E0B',
    unread: 5,
    messages: [
      { id: 'd1', fromMe: false, text: 'Hey, are you free this week?', at: ago(3 * HOUR) },
      { id: 'd2', fromMe: false, text: 'Need a bookshelf built in the study.', at: ago(3 * HOUR - 2 * MINUTE) },
      { id: 'd3', fromMe: false, text: 'Wood is already bought.', at: ago(3 * HOUR - 4 * MINUTE) },
      { id: 'd4', fromMe: false, text: 'About 6 ft tall, five shelves.', at: ago(2 * HOUR) },
      { id: 'd5', fromMe: false, text: 'Can you share a quote?', at: ago(5 * MINUTE) },
    ],
  },
  {
    id: 'tirth',
    name: 'Tirth',
    color: '#14B8A6',
    unread: 0,
    messages: [
      { id: 'e1', fromMe: true, text: 'Payment received, thanks Tirth!', at: ago(2 * DAY) },
      { id: 'e2', fromMe: false, text: 'Thanks for the quick work.', at: ago(2 * DAY - HOUR) },
    ],
  },
  {
    id: 'ujjwal',
    name: 'Ujjwal',
    color: '#EF4444',
    unread: 2,
    messages: [
      { id: 'f1', fromMe: true, text: 'I have finished the first coat of paint.', at: ago(26 * HOUR) },
      { id: 'f2', fromMe: false, text: 'Looks good!', at: ago(3 * HOUR) },
      { id: 'f3', fromMe: false, text: 'When will the second coat be done?', at: ago(90 * MINUTE) },
    ],
  },
];
