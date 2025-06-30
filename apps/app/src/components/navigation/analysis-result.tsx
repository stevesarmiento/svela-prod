'use client'

import React from 'react'
import { Spinner } from '@v1/ui/spinner'
import { IconSparkles } from 'symbols-react'
import ReactMarkdown from 'react-markdown'

interface AnalysisResultProps {
  isLoading: boolean
  result: string
}

export function AnalysisResult({ isLoading, result }: AnalysisResultProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Spinner className="w-8 h-8 mr-3" />
        <span className="text-gray-400 text-lg">Analyzing technical indicators...</span>
      </div>
    )
  }

  if (result) {
    return (
      <div className="space-y-8">
        <div className="prose prose-invert max-w-none">
          <ReactMarkdown 
            components={{
              h1: ({ children }) => (
                <h1 className="text-xl font-bold text-white mb-4 border-b border-gray-700 pb-2">
                  {children}
                </h1>
              ),
              h2: ({ children }) => (
                <h2 className="text-lg font-semibold text-white mb-3 mt-6">
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3 className="text-base font-medium text-gray-200 mb-2 mt-4">
                  {children}
                </h3>
              ),
              p: ({ children }) => (
                <p className="text-gray-300 mb-3 leading-relaxed">
                  {children}
                </p>
              ),
              strong: ({ children }) => (
                <strong className="text-white font-semibold">
                  {children}
                </strong>
              ),
              ul: ({ children }) => (
                <ul className="list-disc list-inside mb-4 space-y-1">
                  {children}
                </ul>
              ),
              li: ({ children }) => (
                <li className="text-gray-300">
                  {children}
                </li>
              ),
              em: ({ children }) => (
                <em className="text-gray-400 italic">
                  {children}
                </em>
              ),
            }}
          >
            {result}
          </ReactMarkdown>
        </div>
      </div>
    )
  }

  return (
    <div className="text-center py-12">
      <IconSparkles className="w-12 h-12 mx-auto mb-4 fill-gray-600" />
      <p className="text-gray-400 text-lg">
        Click the analyze button to generate AI insights
      </p>
      <p className="text-gray-500 text-sm mt-2">
        Our AI will analyze technical indicators, market trends, and provide actionable insights
      </p>
    </div>
  )
} 