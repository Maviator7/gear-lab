import type { TutorialStepDefinition } from './types';

export const MT_BASICS_TUTORIAL: TutorialStepDefinition[] = [
  {
    id: 'engine',
    title: 'エンジンを観察',
    instruction: 'エンジンが動力源です。回転がクラッチへ伝わるところを見てください。',
    explanation:
      'エンジンはトランスミッション全体の入力です。クラッチがつながると、入力軸と常時噛合ギアへ回転が伝わります。',
    highlights: ['engine'],
  },
  {
    id: 'first-gear',
    title: '1速を選択',
    instruction: 'シフトレバーで1速を選択してください。',
    explanation:
      '1速は大きなギア比で出力軸をゆっくり強く回します。発進や坂道で力を出しやすい状態です。',
    highlights: ['gear-1', 'gear-train'],
  },
  {
    id: 'fifth-gear',
    title: '5速へ変更',
    instruction: 'シフトレバーで5速を選択してください。',
    explanation:
      '5速は高速巡航向きです。出力軸を速く回せる一方、トルクの増幅は小さくなります。',
    highlights: ['gear-5', 'output-shaft'],
  },
  {
    id: 'neutral',
    title: 'ニュートラル',
    instruction: 'Nを選択して、出力軸に接続されない状態を見てください。',
    explanation:
      'ニュートラルではギアは回っていても、どのギアも出力軸に固定されません。動力は車輪側へ流れません。',
    highlights: ['gear-train'],
  },
  {
    id: 'clutch-disengage',
    title: 'クラッチを切る',
    instruction: 'クラッチボタンを押して切断状態にしてください。',
    explanation:
      'クラッチを切ると、エンジンと変速機がいったん切り離されます。変速前に動力を抜くための操作です。',
    highlights: ['clutch'],
  },
  {
    id: 'shift-with-clutch',
    title: 'クラッチを切ったまま変速',
    instruction: 'クラッチ切断中に別のギアを選んでください。',
    explanation:
      '動力を切った状態でスリーブを動かすことで、次のギアへ入りやすくなります。',
    highlights: ['clutch', 'gear-train'],
  },
  {
    id: 'clutch-engage',
    title: 'クラッチをつなぐ',
    instruction: 'もう一度クラッチボタンを押して接続してください。',
    explanation:
      'クラッチをつなぐと、エンジンの回転が再び入力軸へ伝わり、選択したギアを通って出力軸へ流れます。',
    highlights: ['clutch', 'output-shaft'],
  },
  {
    id: 'synchronizer',
    title: 'シンクロ機構',
    instruction: '変速中のシンクロナイザーの動きと発光を観察してください。',
    explanation:
      'シンクロナイザーはギアと出力軸側の回転差を合わせます。回転数を近づけることで、滑らかな変速ができます。',
    highlights: ['synchronizer'],
  },
];
