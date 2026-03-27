/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                navy: {
                    DEFAULT: '#0A2740',
                    900: '#061726',
                },
                gold: {
                    DEFAULT: '#F5C518',
                    hover: '#DEC131',
                },
                burgundy: '#B94E5F',
                hospitality: {
                    bg: '#F8F9FA',
                    surface: '#FFFFFF',
                    text: '#1A1A1A',
                    muted: '#6B7280',
                }
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif'],
                serif: ['Playfair Display', 'serif'],
            },
            fontSize: {
                'fluid-h1': ['clamp(2.5rem, 8vw, 5rem)', { lineHeight: '1.1' }],
                'fluid-h2': ['clamp(2rem, 6vw, 4rem)', { lineHeight: '1.2' }],
                'fluid-h3': ['clamp(1.5rem, 4vw, 2.5rem)', { lineHeight: '1.3' }],
                'fluid-body': ['clamp(1rem, 2vw, 1.25rem)', { lineHeight: '1.5' }],
                'fluid-tiny': ['clamp(0.7rem, 1.5vw, 0.9rem)', { lineHeight: '1.4' }],
            },
            spacing: {
                'fluid-4': 'clamp(1rem, 3vw, 2rem)',
                'fluid-8': 'clamp(2rem, 5vw, 4rem)',
                'fluid-12': 'clamp(3rem, 8vw, 6rem)',
                'fluid-16': 'clamp(4rem, 10vw, 8rem)',
            },
            screens: {
                'xs': '475px',
                '3xl': '1920px',
            }
        },
    },
    plugins: [],
}
