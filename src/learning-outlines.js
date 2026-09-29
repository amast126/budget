// Exam prep for the Learning tab: each exam's official skills outline (what the exam measures, and how much each
// area counts) and the modules of Microsoft's free course for it. Checked against Microsoft Learn in September 2026;
// the AI-901 outline is the one dated April 15, 2026. Keys are stable ids for saving your ratings and ticks, so
// edit the text freely but keep a key when the item stays the same.
//
// Microsoft Learn doesn't share personal progress with other sites, so modules are ticked off here by hand.
const ML = 'https://learn.microsoft.com/en-us/training/modules';

export const OUTLINES = {
  'ai-901': {
    updated: '2026-04-15',
    guide: 'https://aka.ms/AI-901-StudyGuide',
    domains: [
      {
        key: 'concepts',
        name: 'Identify AI concepts and capabilities',
        short: 'AI concepts',
        weight: [40, 45],
        groups: [
          {
            key: 'rai',
            name: 'Principles of responsible AI',
            items: [
              ['rai-fair', 'Considerations for fairness in an AI solution'],
              ['rai-safe', 'Considerations for reliability and safety'],
              ['rai-priv', 'Considerations for privacy and security'],
              ['rai-incl', 'Considerations for inclusiveness'],
              ['rai-trans', 'Considerations for transparency'],
              ['rai-acct', 'Considerations for accountability'],
            ],
          },
          {
            key: 'models',
            name: 'AI model components and configurations',
            items: [
              ['mod-genai', 'How generative AI models work'],
              ['mod-pick', 'Choosing an appropriate AI model based on its capabilities'],
              ['mod-deploy', 'Model deployment options and configuration parameters'],
            ],
          },
          {
            key: 'workloads',
            name: 'AI workloads',
            items: [
              ['wl-scen', 'Scenarios for common workloads: generative and agentic AI, text analysis, speech, computer vision, information extraction'],
              ['wl-text', 'Text analysis techniques: keyword extraction, entity detection, sentiment analysis, summarization'],
              ['wl-speech', 'Speech recognition and speech synthesis'],
              ['wl-vision', 'Computer vision and image-generation models'],
              ['wl-extract', 'Extracting information from text, images, audio and video'],
            ],
          },
        ],
      },
      {
        key: 'foundry',
        name: 'Implement AI solutions by using Microsoft Foundry',
        short: 'Foundry',
        weight: [55, 60],
        groups: [
          {
            key: 'genai',
            name: 'Generative AI apps and agents',
            items: [
              ['ga-prompts', 'Writing effective system and user prompts'],
              ['ga-deploy', 'Deploying a model and using it in the Foundry portal'],
              ['ga-chat', 'A lightweight chat client with the Foundry SDK'],
              ['ga-agent', 'Creating and testing a single-agent solution in the portal'],
              ['ga-agentapp', 'A lightweight client app for an agent'],
            ],
          },
          {
            key: 'textspeech',
            name: 'Text and speech',
            items: [
              ['ts-text', 'A lightweight app with text analysis'],
              ['ts-spoken', 'Responding to spoken prompts with a multimodal model'],
              ['ts-speech', 'A lightweight app using Azure Speech in Foundry Tools'],
            ],
          },
          {
            key: 'vision',
            name: 'Computer vision and image generation',
            items: [
              ['cv-input', 'Visual input in prompts to a multimodal model'],
              ['cv-gen', 'Creating new images with generative models'],
              ['cv-app', 'A lightweight app with vision capabilities'],
            ],
          },
          {
            key: 'extract',
            name: 'Information extraction',
            items: [
              ['ie-docs', 'Documents and forms with Azure Content Understanding'],
              ['ie-images', 'Images with Content Understanding'],
              ['ie-av', 'Audio and video with Content Understanding'],
              ['ie-app', 'A lightweight app with information extraction'],
            ],
          },
        ],
      },
    ],
    course: {
      name: 'Introduction to AI in Azure (AI-901T00)',
      url: 'https://learn.microsoft.com/en-us/training/courses/ai-901t00',
      paths: [
        {
          key: 'concepts',
          name: 'AI concepts for developers and technology professionals',
          url: 'https://learn.microsoft.com/en-us/training/paths/ai-concepts/',
          minutes: 231,
          modules: [
            ['get-started-ai-fundamentals', 'Introduction to AI concepts', 10],
            ['fundamentals-generative-ai', 'Introduction to generative AI and agents', 7],
            ['introduction-language', 'Introduction to natural language processing concepts', 7],
            ['introduction-ai-speech', 'Introduction to AI speech concepts', 7],
            ['introduction-computer-vision', 'Introduction to computer vision concepts', 9],
            ['introduction-information-extraction', 'Introduction to AI-powered information extraction concepts', 7],
            ['rag-fundamentals', 'Introduction to retrieval-augmented generation concepts', 8],
          ],
        },
        {
          key: 'apps',
          name: 'Get started with AI applications and agents on Azure',
          url: 'https://learn.microsoft.com/en-us/training/paths/get-started-ai-apps-agents/',
          minutes: 337,
          modules: [
            ['get-started-with-ai-in-azure', 'Get started with AI in Azure', 8],
            ['get-started-with-generative-ai-and-agents', 'Get started with generative AI and agents in Azure', 7],
            ['get-started-text-analysis-azure', 'Get started with text analysis in Azure', 7],
            ['get-started-speech-azure', 'Get started with speech in Azure', 7],
            ['get-started-vision-azure', 'Get started with computer vision in Azure', 7],
            ['get-started-information-extraction', 'Get started with AI-powered information extraction in Azure', 6],
            ['get-started-foundry-iq', 'Get started with Microsoft Foundry IQ', 7],
          ],
        },
      ],
    },
  },
};

// A module's link on Microsoft Learn.
export const moduleUrl = (slug) => `${ML}/${slug}/`;
// Every rated item of an outline, flat: { key, text, domain, group }.
export function outlineItems(o) {
  return o.domains.flatMap((dm) => dm.groups.flatMap((g) => g.items.map(([key, text]) => ({ key, text, domain: dm, group: g }))));
}
