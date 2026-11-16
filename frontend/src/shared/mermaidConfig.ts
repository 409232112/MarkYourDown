/**
 * Shared Mermaid Configuration (Chapter 3, Chapter 9.1)
 * Used by both the live editor and the export pipeline.
 */

import type { ThemeType } from './syntaxPalette';
export type { ThemeType };

export interface MermaidThemeConfig {
  startOnLoad: boolean;
  securityLevel: 'strict' | 'loose' | 'antiscript' | 'sandbox';
  theme: 'base' | 'default' | 'forest' | 'dark' | 'neutral';
  fontFamily: string;
  themeVariables: Record<string, string | boolean>;
}

export function getMermaidConfig(theme: ThemeType = 'warm'): MermaidThemeConfig {
  const isNight = theme === 'night';

  if (isNight) {
    return {
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      fontFamily: 'Inter, "Microsoft YaHei UI", Segoe UI, sans-serif',
      themeVariables: {
        darkMode: true,
        background: '#2E2D2A',
        mainBkg: '#2E2D2A',
        primaryColor: '#30302E',
        primaryTextColor: '#ECEAE3',
        primaryBorderColor: '#4A4943',
        lineColor: '#E0805F',
        secondaryColor: '#262624',
        tertiaryColor: '#1F1E1D',
        edgeLabelBackground: '#30302E',
        nodeBorder: '#4A4943',
        clusterBkg: '#262624',
        clusterBorder: '#4A4943',
        titleColor: '#ECEAE3',
        actorBkg: '#30302E',
        actorBorder: '#4A4943',
        actorTextColor: '#ECEAE3',
        actorLineColor: '#E0805F',
        signalColor: '#ECEAE3',
        signalTextColor: '#ECEAE3',
        labelBoxBkgColor: '#30302E',
        labelBoxBorderColor: '#4A4943',
        labelTextColor: '#ECEAE3',
        loopTextColor: '#ECEAE3',
        noteBorderColor: '#C99540',
        noteBkgColor: '#2E2D2A',
        noteTextColor: '#ECEAE3',
        fontFamily: 'Inter, "Microsoft YaHei UI", Segoe UI, sans-serif',
        fontSize: '14px',
      },
    };
  }

  // Warm paper / Plain neutral
  return {
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'base',
    fontFamily: 'Inter, "Microsoft YaHei UI", Segoe UI, sans-serif',
    themeVariables: {
      darkMode: false,
      background: theme === 'plain' ? '#FFFFFF' : '#FAF9F5',
      mainBkg: theme === 'plain' ? '#FFFFFF' : '#FAF9F5',
      primaryColor: '#F0EEE6',
      primaryTextColor: '#2B2A26',
      primaryBorderColor: '#D6D2C4',
      lineColor: '#C96442',
      secondaryColor: '#FFFFFF',
      tertiaryColor: '#F0EEE6',
      edgeLabelBackground: '#FFFFFF',
      nodeBorder: '#D6D2C4',
      clusterBkg: '#FAF9F5',
      clusterBorder: '#E6E3D8',
      titleColor: '#2B2A26',
      actorBkg: '#F0EEE6',
      actorBorder: '#D6D2C4',
      actorTextColor: '#2B2A26',
      actorLineColor: '#C96442',
      signalColor: '#2B2A26',
      signalTextColor: '#2B2A26',
      labelBoxBkgColor: '#F0EEE6',
      labelBoxBorderColor: '#D6D2C4',
      labelTextColor: '#2B2A26',
      loopTextColor: '#2B2A26',
      noteBorderColor: '#A7731F',
      noteBkgColor: '#F0EEE6',
      noteTextColor: '#2B2A26',
      fontFamily: 'Inter, "Microsoft YaHei UI", Segoe UI, sans-serif',
      fontSize: '14px',
    },
  };
}
