'use client';
import { useEffect, useRef } from 'react';

export default function ConvaiWidget() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const existing = containerRef.current.querySelector('elevenlabs-convai');
    if (!existing) {
      const el = document.createElement('elevenlabs-convai');
      el.setAttribute('agent-id', 'agent_5601k2frztsqeaht9m2tqzc2d08w');
      containerRef.current.appendChild(el);
    }

    const hasScript = document.querySelector('script[data-elevenlabs-convai]');
    if (!hasScript) {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/@elevenlabs/convai-widget-embed';
      script.async = true;
      script.type = 'text/javascript';
      script.setAttribute('data-elevenlabs-convai', 'true');
      document.body.appendChild(script);
    }
  }, []);

  return <div ref={containerRef} />;
}


