FROM nginx:alpine

COPY src/ /usr/share/nginx/html/
COPY resources/ /usr/share/nginx/html/resources/

EXPOSE 80
