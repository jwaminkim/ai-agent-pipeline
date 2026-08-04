import "./globals.css";

export const metadata = {
  title: "AI 에이전트 개발 파이프라인",
  description: "멀티 에이전트 개발 파이프라인 대시보드",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
