import React from 'react';
import Image from 'next/image';
import Link from 'next/link';

export default function AuthNav() {
    return (
      <div className="w-full flex items-center justify-between p-4">
        <Link href="/" className="active:scale-95 transition-spring">
          <Image src="/svela-logo.svg" alt="Logo" className="" width={40} height={40} />
        </Link>
      </div>
    );
  }
  