---
layout: page
title: "Projects"
description: "A showcase of my projects"
header-img: "img/post-bg-about.jpg"
---

<style>
.projects-container {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 30px;
}
.project-item {
  width: 300px;
  background: #f8f9fa;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
  transition: transform 0.3s ease;
}
.project-item:hover {
  transform: translateY(-5px);
}
.project-item img {
  width: 100%;
  height: 200px;
  object-fit: cover;
}
.project-content {
  padding: 20px;
}
.project-content h2 {
  margin-top: 0;
}
.project-content a {
  display: inline-block;
  margin-top: 10px;
  padding: 8px 16px;
  background: #007bff;
  color: white;
  text-decoration: none;
  border-radius: 4px;
}
</style>

<div class="projects-container">
  {% for project in site.projects %}
    <div class="project-item">
      <img src="{{ project.image }}" alt="{{ project.title }}">
      <div class="project-content">
        <h2>{{ project.title }}</h2>
        <p>{{ project.description }}</p>
        <a href="{{ project.url }}">Read more</a>
      </div>
    </div>
  {% endfor %}
</div>
