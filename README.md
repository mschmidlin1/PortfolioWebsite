# Data Scientist Portfolio Website

A clean, responsive, and modern portfolio website designed for data scientists to showcase their projects, skills, and experience.

## Features

- **Single Page Design**: Smooth scrolling navigation between sections
- **Responsive Layout**: Looks great on desktops, tablets, and mobile devices
- **Dark/Light Mode**: Toggle between dark and light themes with preference saving
- **Interactive Elements**: Smooth animations and interactive UI components
- **Sections Include**: 
  - Home
  - About
  - Experience (with resume download)
  - Projects
  - Skills
  - Contact Form
- **Social Media Links**: Fixed position social media icons for easy access
- **Mobile-Friendly Navigation**: Hamburger menu for mobile devices

## Technologies Used

- HTML5
- CSS3 (with custom properties and flexbox/grid layouts)
- JavaScript (vanilla JS with no dependencies)
- Font Awesome for icons

## Customization

To make this portfolio your own:

1. Replace placeholder text and images with your own content in `src/index.html`
2. Update social media links with your profiles
3. Add your resume PDF and images under `resources/images/`
4. Customize colors in the CSS variables (`:root` in `src/css/styles.css`)
5. Add or modify sections as needed

## Setup

Simply clone this repository and open `src/index.html` in your browser (VS Code Live Server works well). No build process or dependencies required.

```
git clone https://github.com/mschmidlin1/PortfolioWebsite.git
cd PortfolioWebsite
```

Place profile images and your resume PDF under `resources/images/`.

## Deployment

See [docs/Deployment.md](docs/Deployment.md) for deploying to the homelab stack (GitHub Actions → GHCR → k3s → Cloudflare Tunnel).

## License

MIT