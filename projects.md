---
layout: page
title: "Projects"
description: "「 A list of my projects 」"
header-img: "img/post-bg-about.jpg"
---

<style>
.projects-container {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
}
.project-item {
  width: 300px;
  margin: 20px;
  text-align: center;
}
.project-item img {
  max-width: 100%;
  height: auto;
}
</style>

<div class="projects-container">
  {% for project in site.projects %}
    <div class="project-item">
      <h2>{{ project.title }}</h2>
      <img src="{{ project.image }}" alt="{{ project.title }}">
      <p>{{ project.description }}</p>
      <a href="{{ project.url }}">Read more</a>
    </div>
  {% endfor %}
</div>