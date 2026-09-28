# ---------- 1) Backend publish (.NET 10) ----------
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY backend/Backend.csproj ./backend/
RUN dotnet restore ./backend/Backend.csproj
COPY backend/ ./backend/
RUN dotnet publish ./backend/Backend.csproj -c Release -o /publish

# ---------- 2) Runtime ----------
FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /publish ./
# Frontend build addımı yoxdur — sadə HTML/CSS/JS birbaşa wwwroot-a düşür.
COPY frontend/ ./wwwroot/

ENV ASPNETCORE_URLS=http://+:8080
ENV DATA_DIR=/data
EXPOSE 8080
ENTRYPOINT ["dotnet", "Backend.dll"]
