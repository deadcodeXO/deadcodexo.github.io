---
layout: page
title: "Projects"
description: "A showcase of my projects"
header-img: "img/about-bg.jpg"
---

{% for project in site.projects %}
  <div class="project-item">
    <h2>{{ project.title }}</h2>
    <img src="{{ project.image }}" alt="{{ project.title }}">
    <p>{{ project.description }}</p>
    <a href="{{ project.url }}">Read more</a>
  </div>
{% endfor %}