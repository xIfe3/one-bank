export interface Post {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  author: string;
  category: string;
  readMins: number;
  body: { h?: string; p: string }[];
}

export const POSTS: Post[] = [
  {
    slug: 'build-an-emergency-fund',
    title: 'How to build an emergency fund that actually lasts',
    excerpt: 'Three to six months of expenses sounds daunting. Here is a practical, step-by-step way to get there with savings goals and auto-save.',
    date: '2026-10-21',
    author: 'Olivia Grant',
    category: 'Money guides',
    readMins: 6,
    body: [
      { p: 'An emergency fund is the foundation of every healthy financial plan. It turns a crisis into an inconvenience — a broken boiler, a surprise medical bill or a gap between jobs.' },
      { h: 'Start with one month', p: 'Six months of expenses is a great long-term target, but it is easier to start with one. Add up your essential monthly costs — rent, utilities, food, transport and debt repayments — and make that your first savings goal.' },
      { h: 'Automate it', p: 'The most reliable savers do not rely on willpower. Create a savings goal in One Bank and switch on auto-save to move a fixed amount every week or month, right after payday.' },
      { h: 'Keep it separate, but accessible', p: 'Your emergency fund should be easy to reach in a real emergency but not so easy that you dip into it for a weekend away. A dedicated savings goal earning monthly interest is ideal.' },
      { h: 'Top it up after you use it', p: 'If you need to use your fund, that is exactly what it is for. Once things settle, rebuild it by temporarily increasing your auto-save amount.' },
    ],
  },
  {
    slug: 'multi-currency-accounts-explained',
    title: 'Multi-currency accounts, explained',
    excerpt: 'Earn in one currency and spend in another? Holding several currencies can save you money and stress. Here is how it works.',
    date: '2026-10-08',
    author: 'Daniel Reyes',
    category: 'Product',
    readMins: 5,
    body: [
      { p: 'Whether you freelance for overseas clients, support family abroad or travel often, converting money every time it moves gets expensive. Multi-currency accounts fix that.' },
      { h: 'One login, three accounts', p: 'With One Bank you can open USD, EUR and GBP accounts, each with its own account number. Receive money in the currency it was sent in and keep it there until you need it.' },
      { h: 'Convert when it suits you', p: 'Exchange between your own accounts at live rates. We show you the mid-market rate, our spread and exactly what you will receive — and lock the quote for 30 seconds.' },
      { h: 'Pay like a local', p: 'Use the matching currency account to pay bills, fund cards or send transfers without conversion fees eating into every payment.' },
    ],
  },
  {
    slug: 'protect-yourself-from-scams',
    title: 'Five ways to protect yourself from payment scams',
    excerpt: 'Scammers are getting more convincing. These simple habits — and a few One Bank features — will keep your money safe.',
    date: '2026-09-29',
    author: 'Marcus Lee',
    category: 'Security',
    readMins: 4,
    body: [
      { h: '1. We will never ask for your PIN or codes', p: 'One Bank staff will never ask for your password, transaction PIN or one-time codes — by phone, email or chat. Anyone who does is a scammer.' },
      { h: '2. Turn on two-factor authentication', p: 'An authenticator app adds a second lock to your account. Enable it in Settings → Security in under a minute.' },
      { h: '3. Check your devices regularly', p: 'Settings → Security shows every device signed in to your account. If you do not recognise one, sign it out immediately and change your password.' },
      { h: '4. Slow down on urgent requests', p: 'Pressure is a scammer’s favourite tool. If a payment request feels urgent and unusual, pause and verify it through another channel.' },
      { h: '5. Use virtual cards online', p: 'Create a separate virtual card for online shopping with a spend limit. If a merchant is compromised, freeze the card instantly.' },
    ],
  },
];

export const LEGAL: Record<string, { title: string; updated: string; sections: { h: string; p: string[] }[] }> = {
  terms: {
    title: 'Terms & Conditions',
    updated: '1 October 2026',
    sections: [
      { h: '1. About these terms', p: ['These terms govern your use of One Bank accounts, cards and services. By opening an account you agree to them.', 'One Bank is a trading name of [Company legal name], registered in [Jurisdiction] (company number [Number]). [Banking licence / partner-bank disclosure].'] },
      { h: '2. Your account', p: ['You must be 18 or over and provide accurate information. You are responsible for keeping your password, transaction PIN and authentication codes secret.', 'We may ask you to verify your identity at any time, and some services require a minimum verification level.'] },
      { h: '3. Payments', p: ['Payments to other One Bank members are instant. Payments to other banks are processed as described in the app and may be reviewed for security.', 'You must ensure you have sufficient available balance, including any fees, before making a payment.'] },
      { h: '4. Fees', p: ['Our fees are listed on the Pricing page and are always shown before you confirm a payment.'] },
      { h: '5. Suspending or closing accounts', p: ['We may suspend or restrict your account to protect you or us, for example if we suspect fraud or a breach of these terms. We will tell you why where we are allowed to.', 'You can close your account at any time once all balances are withdrawn.'] },
      { h: '6. Liability', p: ['We are responsible for losses caused by our errors. We are not responsible for losses caused by you sharing your security details or acting fraudulently.'] },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    updated: '1 October 2026',
    sections: [
      { h: 'What we collect', p: ['Identity and contact information, verification documents, device and sign-in information (browser, operating system, IP address and approximate location), and transaction data.'] },
      { h: 'How we use it', p: ['To provide and secure your account, prevent fraud, meet legal obligations, provide support and — with your permission — send product updates.'] },
      { h: 'Who we share it with', p: ['Service providers who help us operate (such as email delivery), and authorities where the law requires. We never sell your data.'] },
      { h: 'Your rights', p: ['You can access, correct or delete your data, and object to marketing at any time from Settings → Notifications.'] },
      { h: 'Retention', p: ['We keep account and transaction records for as long as required by financial regulations, typically six years after an account closes.'] },
    ],
  },
  cookies: {
    title: 'Cookie Policy',
    updated: '1 October 2026',
    sections: [
      { h: 'Essential cookies', p: ['We use secure, http-only cookies to keep you signed in, protect against cross-site request forgery and remember your session. These cannot be switched off.'] },
      { h: 'Preference cookies', p: ['We store small preferences such as your cookie choice and dismissed announcements in your browser.'] },
      { h: 'Analytics', p: ['If you accept all cookies, we may measure page usage in aggregate to improve One Bank.'] },
    ],
  },
  compliance: {
    title: 'Compliance & Regulatory Information',
    updated: '1 October 2026',
    sections: [
      { h: 'Anti-money laundering', p: ['We verify customer identities, monitor transactions for unusual activity and review large or high-risk payments before they are released.'] },
      { h: 'Know your customer', p: ['Verification levels determine transaction limits. Higher limits require government ID, a selfie and proof of address.'] },
      { h: 'Regulatory status', p: ['[Company legal name] is authorised and regulated by [Regulator] under [licence type and reference number].', 'Eligible deposits are protected by [deposit protection scheme] up to [limit].'] },
    ],
  },
  complaints: {
    title: 'Complaints Procedure',
    updated: '1 October 2026',
    sections: [
      { h: 'How to complain', p: ['Open a support ticket in the app (Support → New ticket) and choose the most relevant category, or use our contact form.'] },
      { h: 'What happens next', p: ['We acknowledge every complaint immediately and aim to resolve it within 15 business days. We will keep you updated in your ticket thread.'] },
      { h: 'If you are not satisfied', p: ['If you are unhappy with our final response you may escalate your complaint to the relevant financial ombudsman in your country.'] },
    ],
  },
};
