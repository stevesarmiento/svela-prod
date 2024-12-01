import React from 'react';

export default function FooterOnboarding() {
  return (
    <div className="flex w-full justify-between items-center p-4">
      <div className="text-white/40 text-xs font-mono w-[360px] text-left">
        <p>
            By using Svela you agree to our <br />
          <a
            href="https://svela.app/terms-of-service/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/80 hover:text-white"
          >
            {' '}
            Terms of Service
          </a>
          ,
          <a
            href="https://svela.app/privacy/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/80 hover:text-white"
          >
            {' '}
            Privacy 
          </a>
          {' '}
          policies.       
        </p>
      </div>
    </div>
  );
}
