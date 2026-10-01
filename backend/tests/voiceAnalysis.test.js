jest.mock('../services/queue', () => ({
  getQueue: () => ({ add: jest.fn().mockResolvedValue({}) }),
  withTimeout: (promise) => promise,
  redisConnection: jest.fn(),
}));
jest.mock('axios');
jest.mock('../services/llm', () => ({
  isConfigured: jest.fn(() => true),
  generateJson: jest.fn(),
}));

const axios = require('axios');
const db = require('./setup');
const llm = require('../services/llm');
const VoiceNote = require('../models/VoiceNote');
const { analyzeVoiceNote, markAnalysisFailed, mp3Url } = require('../services/voiceNotes');
const { createUser } = require('./helpers');

beforeAll(db.connect);
afterEach(async () => {
  await db.clear();
  jest.clearAllMocks();
});
afterAll(db.close);

const URL = 'https://res.cloudinary.com/c/video/upload/v1/sih/voice/u/note.m4a';

test('mp3Url swaps or adds the extension', () => {
  expect(mp3Url(URL)).toBe('https://res.cloudinary.com/c/video/upload/v1/sih/voice/u/note.mp3');
  expect(mp3Url('https://res.cloudinary.com/c/video/upload/v1.2/sih/x')).toBe(
    'https://res.cloudinary.com/c/video/upload/v1.2/sih/x.mp3'
  );
});

test('sends the audio and earlier notes to the model and stores the triage', async () => {
  const user = await createUser();
  await VoiceNote.create({
    user: user._id,
    audioUrl: URL,
    createdAt: new Date(Date.now() - 60 * 60 * 1000),
    analysis: { status: 'done', urgency: 'MEDIUM', summary: 'Followed near the bus stop.' },
  });
  const note = await VoiceNote.create({ user: user._id, audioUrl: URL });
  axios.get.mockResolvedValue({ data: Buffer.from('audio-bytes') });
  llm.generateJson.mockResolvedValue({
    transcript: 'मदद करो',
    urgency: 'HIGH',
    summary: 'User asks for help.',
    pattern: 'Escalating: second report today.',
    actionItems: ['Call the user', 'Alert the nearest patrol'],
  });

  await analyzeVoiceNote(note._id);

  expect(axios.get.mock.calls[0][0]).toMatch(/note\.mp3$/);
  const [{ prompt }] = llm.generateJson.mock.calls[0];
  expect(prompt[0].parts[0].inlineData).toEqual({
    mimeType: 'audio/mp3',
    data: Buffer.from('audio-bytes').toString('base64'),
  });
  expect(prompt[0].parts[1].text).toContain('Followed near the bus stop.');

  const saved = await VoiceNote.findById(note._id);
  expect(saved.analysis).toMatchObject({ status: 'done', urgency: 'HIGH', transcript: 'मदद करो' });
  expect(saved.analysis.actionItems).toHaveLength(2);

  // Already analysed → nothing more happens.
  await analyzeVoiceNote(note._id);
  expect(llm.generateJson).toHaveBeenCalledTimes(1);
});

test('without an LLM the note is marked skipped', async () => {
  llm.isConfigured.mockReturnValueOnce(false);
  const user = await createUser();
  const note = await VoiceNote.create({ user: user._id, audioUrl: URL });
  await analyzeVoiceNote(note._id);
  expect((await VoiceNote.findById(note._id)).analysis.status).toBe('skipped');
  expect(axios.get).not.toHaveBeenCalled();
});

test('a note that keeps failing is marked failed', async () => {
  const user = await createUser();
  const note = await VoiceNote.create({ user: user._id, audioUrl: URL });
  await markAnalysisFailed(note._id, 'timeout');
  expect((await VoiceNote.findById(note._id)).analysis).toMatchObject({ status: 'failed', error: 'timeout' });
});
